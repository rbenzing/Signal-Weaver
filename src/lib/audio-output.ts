/**
 * Audio Output Module - Batched AudioBufferSourceNode playback for HackRF
 *
 * Key design:
 * 1. Batch small DSP chunks into large ~500ms AudioBuffers before scheduling
 * 2. Pre-buffer 2 seconds before first playback
 * 3. Maintain 1.5-2.5s lookahead to absorb main-thread blocking
 * 4. Gapless playback via precise nextStartTime tracking
 */

import type { IAudioOutput, DemodMode } from './interfaces';
const MIN_BUFFER_MS = 500; // Batch samples into 500ms chunks
// Mode-specific gain boost (replaces single AUDIO_GAIN_BOOST constant)
const PRE_BUFFER_MS = 1000; // 1 second before first play (reduced for faster start)
const TARGET_LOOKAHEAD_MS = 1500; // Target 1.5s lookahead
const MIN_LOOKAHEAD_MS = 1000; // Flush if below 1s
const MAX_LOOKAHEAD_MS = 2500; // Drop samples if above 2.5s (prevent overflow)

export class AudioOutput implements IAudioOutput {
  public static readonly GAIN_BY_MODE: Record<DemodMode, number> = {
    FM: 6,
    WFM: 6,
    AM: 3,
    USB: 2,
    LSB: 2,
    CW: 2,
    RAW: 1,
  };
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime = 0;
  private isPlaying = false;
  private _sampleRate = 48000;
  private _volume = 0.75;
  private _outputDeviceId: string = 'default';
  private pendingSamples: Float32Array[] = [];
  private pendingLength = 0;
  private _sourceSampleRate = 48000;
  private _isPreBuffering = true;
  private _preBufferSamplesAccumulated = 0;
  private _buffersScheduled = 0;
  private _lastHealthLogTime = 0;

  get sampleRate(): number {
    return this._sampleRate;
  }

  async init(sampleRate = 48000): Promise<void> {
    this._sampleRate = sampleRate;
    this.audioCtx = new AudioContext({ sampleRate });

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (this._outputDeviceId && this._outputDeviceId !== 'default') {
      try {
        if ('setSinkId' in this.audioCtx) {
          await (this.audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(this._outputDeviceId);
          console.log(`Audio output routed to device: ${this._outputDeviceId}`);
        }
      } catch (err) {
        console.warn('Could not set audio output device:', err);
      }
    }

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    this.gainNode.gain.value = this._volume;
    this.nextStartTime = this.audioCtx.currentTime;
    this.isPlaying = true;
    this.pendingSamples = [];
    this.pendingLength = 0;
    this._isPreBuffering = true;
    this._preBufferSamplesAccumulated = 0;
    this._buffersScheduled = 0;
    this._lastHealthLogTime = 0;

    console.log(
      `🔊 Audio output initialized | Sample rate: ${sampleRate} Hz | ` +
      `AudioContext state: ${this.audioCtx.state} | ` +
      `Volume: ${(this._volume * 100).toFixed(0)}% | ` +
      `Output device: ${this._outputDeviceId} | ` +
      `Buffer size: ${MIN_BUFFER_MS}ms | Pre-buffer: ${PRE_BUFFER_MS}ms`
    );
  }

  private _currentMode: DemodMode = 'FM';

  play(samples: Float32Array, sourceSampleRate = this._sampleRate, mode: DemodMode = 'FM'): void {
    this._currentMode = mode;
    if (!this.audioCtx || !this.gainNode || !this.isPlaying || samples.length === 0) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (sourceSampleRate !== this._sourceSampleRate && this.pendingLength > 0) {
      this.flushAudio();
    }
    this._sourceSampleRate = sourceSampleRate;

    this.pendingSamples.push(samples);
    this.pendingLength += samples.length;

    if (this._isPreBuffering) {
      this._preBufferSamplesAccumulated += samples.length;
      const preBufferTarget = (PRE_BUFFER_MS / 1000) * this._sourceSampleRate;

      if (this._preBufferSamplesAccumulated >= preBufferTarget) {
        this._isPreBuffering = false;
        console.log(`✓ Pre-buffering complete: ${this._preBufferSamplesAccumulated} samples (${(this._preBufferSamplesAccumulated / this._sourceSampleRate).toFixed(2)}s)`);
        this.flushAudio();
      }
      return;
    }

    const now = this.audioCtx.currentTime;
    const lookaheadMs = (this.nextStartTime - now) * 1000;
    const minBufferSamples = (MIN_BUFFER_MS / 1000) * this._sourceSampleRate;

    // CRITICAL: Drop samples if lookahead exceeds maximum (prevents memory overflow)
    if (lookaheadMs > MAX_LOOKAHEAD_MS) {
      const excessMs = lookaheadMs - TARGET_LOOKAHEAD_MS;
      const samplesToDrop = Math.floor((excessMs / 1000) * this._sourceSampleRate);

      if (samplesToDrop > 0) {
        // Drop oldest pending samples to bring lookahead back to target
        let dropped = 0;
        while (dropped < samplesToDrop && this.pendingSamples.length > 0) {
          const chunk = this.pendingSamples.shift()!;
          dropped += chunk.length;
          this.pendingLength -= chunk.length;
        }

        console.warn(
          `🚨 Audio overflow! Dropped ${dropped} samples (${(dropped / this._sourceSampleRate * 1000).toFixed(0)}ms) | ` +
          `Lookahead was ${lookaheadMs.toFixed(0)}ms (max: ${MAX_LOOKAHEAD_MS}ms)`
        );
      }
      return; // Don't flush after dropping
    }

    // Flush if: (1) lookahead is low, OR (2) we have a full buffer's worth, OR (3) lookahead approaching max
    const shouldFlush =
      lookaheadMs < MIN_LOOKAHEAD_MS ||                      // Too low - need more audio
      this.pendingLength >= minBufferSamples ||              // Have enough for a batch
      lookaheadMs > (TARGET_LOOKAHEAD_MS + 500);             // Getting high - flush to prevent buildup

    if (shouldFlush) {
      this.flushAudio();
    }
  }

  private flushAudio(): void {
    if (!this.audioCtx || !this.gainNode || this.pendingLength === 0) return;

    const now = this.audioCtx.currentTime;

    // Merge pending chunks
    const merged = new Float32Array(this.pendingLength);
    let offset = 0;
    for (const chunk of this.pendingSamples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pendingSamples = [];
    this.pendingLength = 0;

    // Apply mode-based gain and clamp
    const gainBoost = AudioOutput.GAIN_BY_MODE[this._currentMode] ?? 6;
    for (let i = 0; i < merged.length; i++) {
      merged[i] = Math.max(-1, Math.min(1, merged[i] * gainBoost));
    }

    const buffer = this.audioCtx.createBuffer(1, merged.length, this._sourceSampleRate);
    buffer.getChannelData(0).set(merged);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    if (this.nextStartTime < now) {
      const underrunGap = now - this.nextStartTime;
      console.warn(`⚠️ Audio underrun: ${(underrunGap * 1000).toFixed(1)}ms gap`);
      this.nextStartTime = now + 0.010;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this._buffersScheduled++;

    if (now - this._lastHealthLogTime >= 5.0) {
      this._lastHealthLogTime = now;
      const lookaheadMs = (this.nextStartTime - now) * 1000;
      let status = '✓';
      if (lookaheadMs < MIN_LOOKAHEAD_MS) status = '⚠️ LOW';
      if (lookaheadMs > MAX_LOOKAHEAD_MS * 0.8) status = '⚠️ HIGH';
      if (lookaheadMs > MAX_LOOKAHEAD_MS) status = '🚨 OVERFLOW';

      console.log(
        `📊 Audio ${status} | Buffers: ${this._buffersScheduled} | ` +
        `Lookahead: ${lookaheadMs.toFixed(0)}ms (range: ${MIN_LOOKAHEAD_MS}-${MAX_LOOKAHEAD_MS}ms) | ` +
        `Last: ${merged.length} samples @ ${this._sourceSampleRate} Hz | ` +
        `Pending: ${this.pendingSamples.length} chunks, ${this.pendingLength} samples`
      );
    }
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume / 100));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  setMuted(muted: boolean): void {
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : this._volume;
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this._outputDeviceId = deviceId;
    if (this.audioCtx && 'setSinkId' in this.audioCtx) {
      try {
        await (this.audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch (err) {
        console.warn('Could not switch audio output device:', err);
      }
    }
  }

  stop(): void {
    this.isPlaying = false;
    this.pendingSamples = [];
    this.pendingLength = 0;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.gainNode = null;
    }
  }

  playTestTone(): void {
    if (!this.audioCtx || !this.gainNode) {
      console.error('AudioOutput not initialized - call init() first');
      return;
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    console.log(`🔊 Playing 440 Hz test tone (1 second) | Volume: ${(this._volume * 100).toFixed(0)}% | AudioContext state: ${this.audioCtx.state}`);

    const oscillator = this.audioCtx.createOscillator();
    const testGain = this.audioCtx.createGain();

    oscillator.frequency.value = 440;
    oscillator.type = 'sine';
    testGain.gain.value = this._volume * 0.3;

    oscillator.connect(testGain);
    testGain.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    oscillator.start(now);
    oscillator.stop(now + 1.0);

    oscillator.onended = () => {
      console.log('✓ Test tone finished');
    };
  }
}
