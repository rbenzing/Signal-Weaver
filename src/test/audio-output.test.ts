/**
 * S-05 — AudioOutput tests
 *
 * Tests that AudioOutput implements IAudioOutput, has the correct per-mode
 * gain table, and that play() accepts the three-parameter signature.
 *
 * AudioContext is not available in jsdom — it is mocked below.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAudioOutput, DemodMode } from '../lib/interfaces';
import { AudioOutput } from '../lib/audio-output';

// ---------------------------------------------------------------------------
// Minimal AudioContext stub for jsdom
// ---------------------------------------------------------------------------

const createGainNodeMock = () => ({
  gain: { value: 1 },
  connect: vi.fn(),
});

const mockAudioCtx = {
  state: 'running',
  currentTime: 0,
  sampleRate: 48000,
  destination: {},
  createGain: vi.fn(() => createGainNodeMock()),
  createBufferSource: vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    disconnect: vi.fn(),
  })),
  createBuffer: vi.fn((_channels: number, length: number, _rate: number) => ({
    length,
    getChannelData: vi.fn(() => new Float32Array(length)),
    copyToChannel: vi.fn(),
  })),
  resume: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
  setSinkId: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  // Provide a global AudioContext mock
  (globalThis as typeof globalThis & { AudioContext: unknown }).AudioContext = vi.fn(() => ({ ...mockAudioCtx, createGain: vi.fn(() => createGainNodeMock()) }));
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Structural check
// ---------------------------------------------------------------------------

describe('AudioOutput structural check', () => {
  it('is assignable to IAudioOutput (TypeScript structural check)', () => {
    const output: IAudioOutput = new AudioOutput();
    expect(output).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GAIN_BY_MODE table
// ---------------------------------------------------------------------------

describe('AudioOutput.GAIN_BY_MODE', () => {
  it('FM gain is 6', () => {
    expect(AudioOutput.GAIN_BY_MODE['FM']).toBe(6);
  });

  it('WFM gain is 6', () => {
    expect(AudioOutput.GAIN_BY_MODE['WFM']).toBe(6);
  });

  it('AM gain is 3', () => {
    expect(AudioOutput.GAIN_BY_MODE['AM']).toBe(3);
  });

  it('USB gain is 2', () => {
    expect(AudioOutput.GAIN_BY_MODE['USB']).toBe(2);
  });

  it('LSB gain is 2', () => {
    expect(AudioOutput.GAIN_BY_MODE['LSB']).toBe(2);
  });

  it('CW gain is 2', () => {
    expect(AudioOutput.GAIN_BY_MODE['CW']).toBe(2);
  });

  it('RAW gain is 1', () => {
    expect(AudioOutput.GAIN_BY_MODE['RAW']).toBe(1);
  });

  it('FM and WFM have greater gain than AM', () => {
    expect(AudioOutput.GAIN_BY_MODE['FM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['AM']);
    expect(AudioOutput.GAIN_BY_MODE['WFM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['AM']);
  });

  it('AM gain is greater than USB/LSB/CW gain', () => {
    expect(AudioOutput.GAIN_BY_MODE['AM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['USB']);
    expect(AudioOutput.GAIN_BY_MODE['AM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['LSB']);
    expect(AudioOutput.GAIN_BY_MODE['AM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['CW']);
  });

  it('USB/LSB/CW gain is greater than RAW gain', () => {
    expect(AudioOutput.GAIN_BY_MODE['USB']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['RAW']);
    expect(AudioOutput.GAIN_BY_MODE['LSB']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['RAW']);
    expect(AudioOutput.GAIN_BY_MODE['CW']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['RAW']);
  });
});

// ---------------------------------------------------------------------------
// play() signature
// ---------------------------------------------------------------------------

describe('AudioOutput.play() signature', () => {
  it('play() accepts (samples: Float32Array, sampleRate: number, mode: DemodMode)', async () => {
    const output = new AudioOutput();
    await output.init();
    // TypeScript will fail to compile if the signature does not match
    const samples = new Float32Array(100).fill(0.5);
    expect(() => output.play(samples, 48000, 'FM')).not.toThrow();
  });

  it('play() with mode RAW does not throw', async () => {
    const output = new AudioOutput();
    await output.init();
    expect(() => output.play(new Float32Array(100), 48000, 'RAW')).not.toThrow();
  });

  it('play() with mode AM does not throw', async () => {
    const output = new AudioOutput();
    await output.init();
    expect(() => output.play(new Float32Array(100), 48000, 'AM')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setOutputDevice()
// ---------------------------------------------------------------------------

describe('AudioOutput.setOutputDevice()', () => {
  it('returns a Promise', () => {
    const output = new AudioOutput();
    const result = output.setOutputDevice('some-device-id');
    expect(result).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// Mode-based gain boost behaviour
// ---------------------------------------------------------------------------

describe('AudioOutput mode-based gain boost', () => {
  it('FM mode has a higher gain multiplier than AM mode', () => {
    expect(AudioOutput.GAIN_BY_MODE['FM']).toBeGreaterThan(AudioOutput.GAIN_BY_MODE['AM']);
  });

  it('WFM mode has a higher gain multiplier than SSB modes', () => {
    const ssbGain = AudioOutput.GAIN_BY_MODE['USB'];
    expect(AudioOutput.GAIN_BY_MODE['WFM']).toBeGreaterThan(ssbGain);
  });

  it('SSB modes (USB/LSB) have no FM-level boost', () => {
    expect(AudioOutput.GAIN_BY_MODE['USB']).toBeLessThan(AudioOutput.GAIN_BY_MODE['FM']);
    expect(AudioOutput.GAIN_BY_MODE['LSB']).toBeLessThan(AudioOutput.GAIN_BY_MODE['FM']);
  });
});
