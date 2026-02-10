/**
 * Audio Output Module - Web Audio API playback for demodulated signals
 */

export class AudioOutput {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime = 0;
  private isPlaying = false;
  private _sampleRate = 48000;
  private _volume = 0.5;

  get sampleRate(): number {
    return this._sampleRate;
  }

  async init(sampleRate = 48000): Promise<void> {
    this._sampleRate = sampleRate;
    this.audioCtx = new AudioContext({ sampleRate });
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    this.gainNode.gain.value = this._volume;
    this.nextStartTime = this.audioCtx.currentTime;
    this.isPlaying = true;
    console.log('Audio output initialized at', sampleRate, 'Hz');
  }

  play(samples: Float32Array): void {
    if (!this.audioCtx || !this.gainNode || !this.isPlaying) return;
    if (samples.length === 0) return;

    const buffer = this.audioCtx.createBuffer(1, samples.length, this._sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = this.audioCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    // Don't let the buffer grow too far ahead
    if (this.nextStartTime > now + 0.5) {
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
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.gainNode = null;
    }
  }
}
