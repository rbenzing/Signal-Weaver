/**
 * S-02 — MockAudioOutput
 *
 * Zero-dependency test double for IAudioOutput.
 * Records all calls for assertion in tests.
 */

import type { IAudioOutput, DemodMode } from '../../lib/interfaces';

export interface PlayCall {
  samples: Float32Array;
  sampleRate: number;
  mode: DemodMode;
}

export class MockAudioOutput implements IAudioOutput {
  // Recorded state ——————————————————————————————————————————————————————————
  initCalled = false;
  stopCalled = false;
  volume = 75;
  muted = false;
  outputDeviceId = 'default';
  playedSamples: PlayCall[] = [];

  // IAudioOutput ————————————————————————————————————————————————————————————
  async init(): Promise<void> {
    this.initCalled = true;
  }

  play(samples: Float32Array, sampleRate: number, mode: DemodMode): void {
    this.playedSamples.push({ samples, sampleRate, mode });
  }

  stop(): void {
    this.stopCalled = true;
  }

  setVolume(gain: number): void {
    this.volume = gain;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
  }

  // Derived helpers ————————————————————————————————————————————————————————

  get totalSamplesReceived(): number {
    return this.playedSamples.reduce((sum, call) => sum + call.samples.length, 0);
  }
}
