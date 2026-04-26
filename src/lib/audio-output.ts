/**
 * Audio Output Module - Low-latency live SDR audio playback
 *
 * Design philosophy: live stream, not media player.
 * - No pre-buffering: schedule first audio immediately with a small scheduling
 *   lookahead (SCHEDULE_AHEAD_MS) so the browser has time to render it.
 * - Small batches (MIN_BUFFER_MS) to keep latency low — SDR listeners expect
 *   near-real-time audio, not the 1-2s delay of a podcast buffer.
 * - Tight lookahead window: enough to absorb main-thread jitter, not so large
 *   that it adds perceptible delay.
 * - Gapless playback via precise nextStartTime chaining.
 */

import type { IAudioOutput, DemodMode } from './interfaces';
const MIN_BUFFER_MS = 20;          // Flush once we have 20ms of audio
const SCHEDULE_AHEAD_MS = 150;     // Initial scheduling lookahead (browser render budget)
const TARGET_LOOKAHEAD_MS = 200;   // Target live-stream lookahead
const MIN_LOOKAHEAD_MS = 80;       // Flush immediately if lookahead drops this low
const MAX_LOOKAHEAD_MS = 500;      // Drop samples above this (prevents drift buildup)

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
    // Start scheduling SCHEDULE_AHEAD_MS from now so the first buffer has time
    // to reach the browser's audio renderer before it's due to play.
    this.nextStartTime = this.audioCtx.currentTime + SCHEDULE_AHEAD_MS / 1000;
    this.isPlaying = true;
    this.pendingSamples = [];
    this.pendingLength = 0;
    this._buffersScheduled = 0;
    this._lastHealthLogTime = 0;

    console.log(
      `🔊 Audio output initialized | Sample rate: ${sampleRate} Hz | ` +
      `AudioContext state: ${this.audioCtx.state} | ` +
      `Volume: ${(this._volume * 100).toFixed(0)}% | ` +
      `Output device: ${this._outputDeviceId} | ` +
      `Batch: ${MIN_BUFFER_MS}ms | Lookahead: ${SCHEDULE_AHEAD_MS}ms`
    );
  }

  private _currentMode: DemodMode = 'FM';

  play(samples: Float32Array, sourceSampleRate = this._sampleRate, mode: DemodMode = 'FM'): void {
    this._currentMode = mode;
    if (!this.audioCtx || !this.gainNode || !this.isPlaying || samples.length === 0) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Flush pending samples if sample rate changed mid-stream
    if (sourceSampleRate !== this._sourceSampleRate && this.pendingLength > 0) {
      this.flushAudio();
    }
    this._sourceSampleRate = sourceSampleRate;

    this.pendingSamples.push(samples);
    this.pendingLength += samples.length;

    const now = this.audioCtx.currentTime;
    const lookaheadMs = (this.nextStartTime - now) * 1000;
    const minBufferSamples = (MIN_BUFFER_MS / 1000) * this._sourceSampleRate;

    // Drop oldest samples if lookahead exceeds max — live stream, we never
    // want to fall behind. Trim back to TARGET_LOOKAHEAD_MS.
    if (lookaheadMs > MAX_LOOKAHEAD_MS) {
      const excessMs = lookaheadMs - TARGET_LOOKAHEAD_MS;
      const samplesToDrop = Math.floor((excessMs / 1000) * this._sourceSampleRate);
      let dropped = 0;
      while (dropped < samplesToDrop && this.pendingSamples.length > 0) {
        const chunk = this.pendingSamples.shift()!;
        dropped += chunk.length;
        this.pendingLength -= chunk.length;
      }
      if (dropped > 0) {
        console.warn(
          `🚨 Audio overflow! Dropped ${dropped} samples (${(dropped / this._sourceSampleRate * 1000).toFixed(0)}ms) | ` +
          `Lookahead was ${lookaheadMs.toFixed(0)}ms`
        );
      }
      return;
    }

    // Flush when: we have a full minimum batch, OR lookahead has dropped low
    // enough that we need to feed the scheduler immediately.
    const shouldFlush =
      this.pendingLength >= minBufferSamples ||
      lookaheadMs < MIN_LOOKAHEAD_MS;

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
      // Scheduler fell behind (main-thread block, tab backgrounded, etc.)
      // Snap to now — live stream means we play current audio immediately,
      // not catch up by replaying stale audio from the past.
      const underrunGap = now - this.nextStartTime;
      if (underrunGap > 0.005) {
        console.warn(`⚠️ Audio underrun: ${(underrunGap * 1000).toFixed(1)}ms — snapping to live`);
      }
      this.nextStartTime = now;
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
