/**
 * S-03 / S-12 — DSPPipeline tests
 *
 * Tests for the new DSPPipeline class extracted from useHackRF.
 * Imports from a file that does not yet exist — expected to fail in Red phase.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DSPPipeline } from '../lib/dsp-pipeline';
import { MockSDRDevice } from './mocks/MockSDRDevice';

// Helper: build a zero IQ block of given byte length
function zeroIQ(byteLength: number): Int8Array {
  return new Int8Array(byteLength);
}

// One full USB packet at 8 MS/s is 16 384 bytes = 8 192 IQ pairs
const PACKET_BYTES = 16384;

// Startup discard target
const DISCARD_TARGET = 100_000;
const PACKET_SAMPLES = PACKET_BYTES / 2; // 8 192 IQ samples per packet
const WARM_UP_PACKETS = Math.ceil(DISCARD_TARGET / PACKET_SAMPLES); // ~13 packets

describe('DSPPipeline — construction', () => {
  it('can be instantiated with (mode, sampleRate, offsetHz) without throwing', () => {
    expect(() => new DSPPipeline('FM', 8e6, 0)).not.toThrow();
  });

  it('can be instantiated in all supported modes', () => {
    const modes = ['FM', 'WFM', 'AM', 'USB', 'LSB', 'CW', 'RAW'] as const;
    for (const mode of modes) {
      expect(() => new DSPPipeline(mode, 8e6, 0)).not.toThrow();
    }
  });
});

describe('DSPPipeline — process() return shape', () => {
  let pipeline: DSPPipeline;

  beforeEach(() => {
    pipeline = new DSPPipeline('FM', 8e6, 0);
  });

  it('returns an object with spectrumData, audioSamples, audioSampleRate, signalStrength, peak', () => {
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result).toHaveProperty('spectrumData');
    expect(result).toHaveProperty('audioSamples');
    expect(result).toHaveProperty('audioSampleRate');
    expect(result).toHaveProperty('signalStrength');
    expect(result).toHaveProperty('peak');
  });

  it('spectrumData is a Float32Array', () => {
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result.spectrumData).toBeInstanceOf(Float32Array);
  });

  it('audioSamples is a Float32Array', () => {
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result.audioSamples).toBeInstanceOf(Float32Array);
  });

  it('spectrumData has length 1024 (full FFT size)', () => {
    // Process enough packets to exit startup window, then check
    for (let i = 0; i < WARM_UP_PACKETS + 1; i++) {
      const result = pipeline.process(zeroIQ(PACKET_BYTES));
      if (i === WARM_UP_PACKETS) {
        expect(result.spectrumData.length).toBe(1024);
      }
    }
  });
});

describe('DSPPipeline — startup transient discard window', () => {
  it('returns audioSamples of length 0 for the first WARM_UP_PACKETS packets', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    for (let i = 0; i < WARM_UP_PACKETS; i++) {
      const result = pipeline.process(zeroIQ(PACKET_BYTES));
      expect(result.audioSamples.length).toBe(0);
    }
  });

  it('spectrumData length is 1024 even during startup window', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result.spectrumData.length).toBe(1024);
  });

  it('returns audioSamples.length > 0 after warm-up with FM + sine IQ', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    // Warm up past the discard window
    for (let i = 0; i < WARM_UP_PACKETS; i++) {
      pipeline.process(MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2));
    }
    // After warm-up, audio should be produced
    const result = pipeline.process(MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2));
    expect(result.audioSamples.length).toBeGreaterThan(0);
  });
});

describe('DSPPipeline — signalStrength and peak invariants', () => {
  it('signalStrength is a finite number in range [-120, 0] after processing real data', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);
    let result = pipeline.process(iqData);
    // Use the last result to be safe
    for (let i = 0; i < WARM_UP_PACKETS + 1; i++) {
      result = pipeline.process(iqData);
    }
    expect(Number.isFinite(result.signalStrength)).toBe(true);
    expect(result.signalStrength).toBeGreaterThanOrEqual(-120);
    expect(result.signalStrength).toBeLessThanOrEqual(0);
  });

  it('peak >= signalStrength for every result (invariant)', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);
    for (let i = 0; i < WARM_UP_PACKETS + 5; i++) {
      const result = pipeline.process(iqData);
      expect(result.peak).toBeGreaterThanOrEqual(result.signalStrength);
    }
  });

  it('signalStrength is very low (< -80 dB) with all-zero IQ input', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    // Need enough packets to get past the startup window but with zero input
    for (let i = 0; i < WARM_UP_PACKETS + 2; i++) {
      const result = pipeline.process(zeroIQ(PACKET_BYTES));
      if (i >= WARM_UP_PACKETS) {
        expect(result.signalStrength).toBeLessThan(-80);
      }
    }
  });
});

describe('DSPPipeline — setMode()', () => {
  it('setMode("AM") then process() does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setMode('AM');
    expect(() => pipeline.process(zeroIQ(PACKET_BYTES))).not.toThrow();
  });

  it('setMode("USB") then process() does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setMode('USB');
    expect(() => pipeline.process(zeroIQ(PACKET_BYTES))).not.toThrow();
  });

  it('setMode("LSB") then process() does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setMode('LSB');
    expect(() => pipeline.process(zeroIQ(PACKET_BYTES))).not.toThrow();
  });

  it('setMode("CW") then process() does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setMode('CW');
    expect(() => pipeline.process(zeroIQ(PACKET_BYTES))).not.toThrow();
  });

  it('setMode("RAW") then process() returns audioSamples.length > 0 after warmup', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setMode('RAW');
    // Warm up
    for (let i = 0; i < WARM_UP_PACKETS; i++) {
      pipeline.process(MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2));
    }
    const result = pipeline.process(MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2));
    expect(result.audioSamples.length).toBeGreaterThan(0);
  });

  it('setMode() does not throw and next process() call returns valid DSPResult', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const modes = ['AM', 'USB', 'LSB', 'WFM', 'CW', 'RAW', 'FM'] as const;
    for (const mode of modes) {
      pipeline.setMode(mode);
      const result = pipeline.process(zeroIQ(PACKET_BYTES));
      expect(result.spectrumData).toBeInstanceOf(Float32Array);
    }
  });
});

describe('DSPPipeline — setSampleRate()', () => {
  it('setSampleRate(4e6) then process() does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setSampleRate(4e6);
    expect(() => pipeline.process(zeroIQ(PACKET_BYTES))).not.toThrow();
  });

  it('setSampleRate(2e6) then process() returns valid DSPResult', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setSampleRate(2e6);
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result.spectrumData).toBeInstanceOf(Float32Array);
    expect(result.spectrumData.length).toBe(1024);
  });
});

describe('DSPPipeline — reset()', () => {
  it('reset() causes the next process() call to return audioSamples of length 0 (startup window re-entered)', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);

    // Get past the startup window
    for (let i = 0; i < WARM_UP_PACKETS + 1; i++) {
      pipeline.process(iqData);
    }

    // Reset restarts the discard window
    pipeline.reset();
    const result = pipeline.process(iqData);
    expect(result.audioSamples.length).toBe(0);
  });
});

describe('DSPPipeline — setOffset()', () => {
  it('setOffset(200e3) does not throw', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    expect(() => pipeline.setOffset(200e3)).not.toThrow();
  });

  it('setOffset() then process() returns valid DSPResult', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    pipeline.setOffset(100e3);
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result.spectrumData).toBeInstanceOf(Float32Array);
  });
});

describe('DSPPipeline — audioSampleRate', () => {
  it('audioSampleRate is within 10% of 48000 for FM mode at 8 MS/s', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);

    // Warm up so we get audio back
    for (let i = 0; i < WARM_UP_PACKETS; i++) {
      pipeline.process(iqData);
    }
    const result = pipeline.process(iqData);

    expect(result.audioSampleRate).toBeGreaterThan(48000 * 0.9);
    expect(result.audioSampleRate).toBeLessThan(48000 * 1.1);
  });
});

// ---------------------------------------------------------------------------
// S-12 additions — noiseFloor in DSPResult
// ---------------------------------------------------------------------------

describe('DSPPipeline — noiseFloor (S-12)', () => {
  it('DSPResult contains a noiseFloor field', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(result).toHaveProperty('noiseFloor');
  });

  it('noiseFloor is a finite number', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const result = pipeline.process(zeroIQ(PACKET_BYTES));
    expect(Number.isFinite(result.noiseFloor)).toBe(true);
  });

  it('noiseFloor <= signalStrength (noise floor is below mean power)', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);
    for (let i = 0; i < WARM_UP_PACKETS + 2; i++) {
      const result = pipeline.process(iqData);
      if (i >= WARM_UP_PACKETS) {
        expect(result.noiseFloor).toBeLessThanOrEqual(result.signalStrength);
      }
    }
  });

  it('noiseFloor <= peak always', () => {
    const pipeline = new DSPPipeline('FM', 8e6, 0);
    const iqData = MockSDRDevice.makeSineIQ(100e3, 8e6, PACKET_BYTES / 2);
    for (let i = 0; i < WARM_UP_PACKETS + 2; i++) {
      const result = pipeline.process(iqData);
      expect(result.noiseFloor).toBeLessThanOrEqual(result.peak);
    }
  });
});
