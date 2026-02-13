/**
 * Audio Output Module - Web Audio API playback for demodulated signals
 * 
 * Key design decisions:
 * 1. AudioContext.resume() is called explicitly to handle Chrome's autoplay policy
 * 2. Small sample chunks are accumulated into larger buffers (~4096 samples) before
 *    scheduling to avoid overhead from thousands of tiny AudioBufferSourceNodes
 * 3. Gapless playback via precise scheduling with nextStartTime tracking
 */

const MIN_BUFFER_SIZE = 4096; // Accumulate at least this many samples before scheduling

export class AudioOutput {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime = 0;
  private isPlaying = false;
  private _sampleRate = 48000;
  private _volume = 0.5;
  private pendingSamples: Float32Array[] = [];
  private pendingLength = 0;

  get sampleRate(): number {
    return this._sampleRate;
  }

  async init(sampleRate = 48000): Promise<void> {
    this._sampleRate = sampleRate;
    this.audioCtx = new AudioContext({ sampleRate });

    // CRITICAL: Chrome suspends AudioContext until resume() is called from a user gesture
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    this.gainNode.gain.value = this._volume;
    this.nextStartTime = this.audioCtx.currentTime;
    this.isPlaying = true;
    this.pendingSamples = [];
    this.pendingLength = 0;
    console.log(`Audio output initialized at ${sampleRate} Hz, state: ${this.audioCtx.state}`);
  }

  play(samples: Float32Array): void {
    if (!this.audioCtx || !this.gainNode || !this.isPlaying) return;
    if (samples.length === 0) return;

    // Resume if somehow suspended again
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Accumulate small chunks into larger buffers for efficient scheduling
    this.pendingSamples.push(samples);
    this.pendingLength += samples.length;

    if (this.pendingLength >= MIN_BUFFER_SIZE) {
      this.flushAudio();
    }
  }

  private flushAudio(): void {
    if (!this.audioCtx || !this.gainNode || this.pendingLength === 0) return;

    // Merge all pending chunks into one buffer
    const merged = new Float32Array(this.pendingLength);
    let offset = 0;
    for (const chunk of this.pendingSamples) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pendingSamples = [];
    this.pendingLength = 0;

    const buffer = this.audioCtx.createBuffer(1, merged.length, this._sampleRate);
    buffer.getChannelData(0).set(merged);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = this.audioCtx.currentTime;
    if (this.nextStartTime < now) {
      // We fell behind — restart scheduling slightly ahead
      this.nextStartTime = now + 0.05;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    // Don't let the schedule drift too far ahead (max 1 second buffer)
    if (this.nextStartTime > now + 1.0) {
      this.nextStartTime = now + 0.1;
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
}