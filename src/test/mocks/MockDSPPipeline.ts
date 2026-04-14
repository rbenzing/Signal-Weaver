/**
 * Minimal MockDSPPipeline — used in S-07, S-09 tests.
 *
 * Returns a fully controllable DSPResult so hook behaviour can be asserted
 * without a real DSP implementation.
 */

import type { IDSPPipeline, DSPResult, DemodMode } from '../../lib/interfaces';

export class MockDSPPipeline implements IDSPPipeline {
  processResult: DSPResult = {
    spectrumData: new Float32Array(1024).fill(-80),
    audioSamples: new Float32Array(512),
    audioSampleRate: 48000,
    signalStrength: -60,
    peak: -50,
    noiseFloor: -100,
  };

  processCallCount = 0;
  lastRawIQ: Int8Array | null = null;
  currentMode: DemodMode = 'FM';
  currentSampleRate = 8e6;
  currentOffset = 0;
  resetCalled = false;

  process(rawIQ: Int8Array): DSPResult {
    this.processCallCount++;
    this.lastRawIQ = rawIQ;
    return this.processResult;
  }

  setMode(mode: DemodMode): void {
    this.currentMode = mode;
  }

  setSampleRate(hz: number): void {
    this.currentSampleRate = hz;
  }

  setOffset(hz: number): void {
    this.currentOffset = hz;
  }

  reset(): void {
    this.resetCalled = true;
    this.processCallCount = 0;
  }
}
