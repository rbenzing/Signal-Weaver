/**
 * S-01 — Interface shape tests
 *
 * These tests verify that the exported types in src/lib/interfaces.ts have the
 * correct shape.  TypeScript errors here mean the implementation does not
 * satisfy the contract.  There is intentionally zero implementation code in
 * this file.
 */

import { describe, it, expect } from 'vitest';
import type {
  DemodMode,
  DSPResult,
  HackRFDeviceInfo,
  ISDRDevice,
  IAudioOutput,
  IDSPPipeline,
} from '../lib/interfaces';

// ---------------------------------------------------------------------------
// DemodMode
// ---------------------------------------------------------------------------

describe('DemodMode', () => {
  it('accepts all seven valid literal values', () => {
    const modes: DemodMode[] = ['FM', 'WFM', 'AM', 'USB', 'LSB', 'CW', 'RAW'];
    expect(modes).toHaveLength(7);
  });

  it('contains exactly the expected string literals', () => {
    const expected = ['FM', 'WFM', 'AM', 'USB', 'LSB', 'CW', 'RAW'];
    const modes: DemodMode[] = expected as DemodMode[];
    expect(modes).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// DSPResult
// ---------------------------------------------------------------------------

describe('DSPResult', () => {
  it('accepts an object with all required fields', () => {
    const result: DSPResult = {
      spectrumData: new Float32Array(1024),
      audioSamples: new Float32Array(512),
      audioSampleRate: 48000,
      signalStrength: -60,
      peak: -50,
      noiseFloor: -100,
    };
    expect(result.spectrumData).toBeInstanceOf(Float32Array);
    expect(result.audioSamples).toBeInstanceOf(Float32Array);
    expect(result.audioSampleRate).toBe(48000);
    expect(result.signalStrength).toBe(-60);
    expect(result.peak).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// HackRFDeviceInfo
// ---------------------------------------------------------------------------

describe('HackRFDeviceInfo', () => {
  it('accepts an object with boardId, firmwareVersion, and serialNumber', () => {
    const info: HackRFDeviceInfo = {
      boardId: 2,
      firmwareVersion: '2023.01.1',
      serialNumber: 'ABCD00000000',
    };
    expect(info.boardId).toBe(2);
    expect(info.firmwareVersion).toBe('2023.01.1');
    expect(info.serialNumber).toBe('ABCD00000000');
  });
});

// ---------------------------------------------------------------------------
// ISDRDevice — structural type check via mock implementation
// ---------------------------------------------------------------------------

describe('ISDRDevice', () => {
  it('is satisfied by an object implementing all required methods', () => {
    const mockDevice: ISDRDevice = {
      get isConnected() { return false; },
      connect: () => Promise.resolve({ boardId: 0, firmwareVersion: '', serialNumber: '' }),
      disconnect: () => Promise.resolve(),
      setFrequency: (_hz: number) => Promise.resolve(),
      setSampleRate: (_hz: number) => Promise.resolve(),
      setBasebandFilter: (_hz: number) => Promise.resolve(),
      setLnaGain: (_db: number) => Promise.resolve(),
      setVgaGain: (_db: number) => Promise.resolve(),
      setAmpEnable: (_enabled: boolean) => Promise.resolve(),
      startRx: (_cb: (data: Int8Array) => void) => Promise.resolve(),
      stopStreaming: () => Promise.resolve(),
    };

    expect(typeof mockDevice.connect).toBe('function');
    expect(typeof mockDevice.disconnect).toBe('function');
    expect(typeof mockDevice.setFrequency).toBe('function');
    expect(typeof mockDevice.setSampleRate).toBe('function');
    expect(typeof mockDevice.setBasebandFilter).toBe('function');
    expect(typeof mockDevice.setLnaGain).toBe('function');
    expect(typeof mockDevice.setVgaGain).toBe('function');
    expect(typeof mockDevice.setAmpEnable).toBe('function');
    expect(typeof mockDevice.startRx).toBe('function');
    expect(typeof mockDevice.stopStreaming).toBe('function');
  });

  it('connect() returns a Promise resolving to HackRFDeviceInfo shape', async () => {
    const mockDevice: ISDRDevice = {
      get isConnected() { return false; },
      connect: () => Promise.resolve({ boardId: 2, firmwareVersion: 'mock', serialNumber: 'SN001' }),
      disconnect: () => Promise.resolve(),
      setFrequency: (_hz: number) => Promise.resolve(),
      setSampleRate: (_hz: number) => Promise.resolve(),
      setBasebandFilter: (_hz: number) => Promise.resolve(),
      setLnaGain: (_db: number) => Promise.resolve(),
      setVgaGain: (_db: number) => Promise.resolve(),
      setAmpEnable: (_enabled: boolean) => Promise.resolve(),
      startRx: (_cb: (data: Int8Array) => void) => Promise.resolve(),
      stopStreaming: () => Promise.resolve(),
    };
    const info = await mockDevice.connect();
    expect(info).toHaveProperty('boardId');
    expect(info).toHaveProperty('firmwareVersion');
    expect(info).toHaveProperty('serialNumber');
  });
});

// ---------------------------------------------------------------------------
// IAudioOutput — structural type check via mock implementation
// ---------------------------------------------------------------------------

describe('IAudioOutput', () => {
  it('is satisfied by an object implementing all required methods', () => {
    const mockAudio: IAudioOutput = {
      init: () => Promise.resolve(),
      play: (_samples: Float32Array, _sampleRate: number, _mode: DemodMode) => {},
      stop: () => {},
      setVolume: (_gain: number) => {},
      setMuted: (_muted: boolean) => {},
      setOutputDevice: (_deviceId: string) => Promise.resolve(),
    };

    expect(typeof mockAudio.init).toBe('function');
    expect(typeof mockAudio.play).toBe('function');
    expect(typeof mockAudio.stop).toBe('function');
    expect(typeof mockAudio.setVolume).toBe('function');
    expect(typeof mockAudio.setMuted).toBe('function');
    expect(typeof mockAudio.setOutputDevice).toBe('function');
  });

  it('setOutputDevice() returns a Promise', async () => {
    const mockAudio: IAudioOutput = {
      init: () => Promise.resolve(),
      play: (_samples: Float32Array, _sampleRate: number, _mode: DemodMode) => {},
      stop: () => {},
      setVolume: (_gain: number) => {},
      setMuted: (_muted: boolean) => {},
      setOutputDevice: (_deviceId: string) => Promise.resolve(),
    };
    const result = mockAudio.setOutputDevice('default');
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// ---------------------------------------------------------------------------
// IDSPPipeline — structural type check via mock implementation
// ---------------------------------------------------------------------------

describe('IDSPPipeline', () => {
  it('is satisfied by an object implementing all required methods', () => {
    const mockPipeline: IDSPPipeline = {
      process: (_rawIQ: Int8Array): DSPResult => ({
        spectrumData: new Float32Array(1024),
        audioSamples: new Float32Array(0),
        audioSampleRate: 48000,
        signalStrength: -100,
        peak: -100,
        noiseFloor: -100,
      }),
      setMode: (_mode: DemodMode) => {},
      setSampleRate: (_hz: number) => {},
      setOffset: (_hz: number) => {},
      reset: () => {},
    };

    expect(typeof mockPipeline.process).toBe('function');
    expect(typeof mockPipeline.setMode).toBe('function');
    expect(typeof mockPipeline.setSampleRate).toBe('function');
    expect(typeof mockPipeline.setOffset).toBe('function');
    expect(typeof mockPipeline.reset).toBe('function');
  });

  it('process() returns a DSPResult with correct field types', () => {
    const mockPipeline: IDSPPipeline = {
      process: (_rawIQ: Int8Array): DSPResult => ({
        spectrumData: new Float32Array(1024),
        audioSamples: new Float32Array(256),
        audioSampleRate: 48000,
        signalStrength: -75,
        peak: -65,
        noiseFloor: -100,
      }),
      setMode: (_mode: DemodMode) => {},
      setSampleRate: (_hz: number) => {},
      setOffset: (_hz: number) => {},
      reset: () => {},
    };

    const result = mockPipeline.process(new Int8Array(16384));
    expect(result.spectrumData).toBeInstanceOf(Float32Array);
    expect(result.audioSamples).toBeInstanceOf(Float32Array);
    expect(typeof result.audioSampleRate).toBe('number');
    expect(typeof result.signalStrength).toBe('number');
    expect(typeof result.peak).toBe('number');
  });
});
