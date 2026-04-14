/**
 * Shared interfaces and types for the signal-weaver SDR application.
 * This file has zero imports — all other modules import from here.
 */

// ---------------------------------------------------------------------------
// DemodMode
// ---------------------------------------------------------------------------

export type DemodMode = 'FM' | 'WFM' | 'AM' | 'USB' | 'LSB' | 'CW' | 'RAW';

// ---------------------------------------------------------------------------
// DSPResult
// ---------------------------------------------------------------------------

export interface DSPResult {
  /** FFT power spectrum in dB, length === fftSize (default 1024). */
  spectrumData: Float32Array;
  /** Demodulated mono PCM samples in [-1, 1] range, ready for audio output. */
  audioSamples: Float32Array;
  /** Sample rate of audioSamples in Hz. */
  audioSampleRate: number;
  /** Mean FFT bin power in dB for this block. Used for signal-strength meter. */
  signalStrength: number;
  /** Peak FFT bin power in dB for this block. Used for peak-hold display. */
  peak: number;
  /** Noise floor estimate in dB (median of lowest 25% of FFT bins). */
  noiseFloor: number;
}

// ---------------------------------------------------------------------------
// HackRFDeviceInfo
// ---------------------------------------------------------------------------

export interface HackRFDeviceInfo {
  boardId: number;
  firmwareVersion: string;
  serialNumber: string;
}

// ---------------------------------------------------------------------------
// ISDRDevice
// ---------------------------------------------------------------------------

export interface ISDRDevice {
  readonly isConnected: boolean;
  connect(): Promise<HackRFDeviceInfo>;
  disconnect(): Promise<void>;
  setFrequency(hz: number): Promise<void>;
  setSampleRate(hz: number): Promise<void>;
  setBasebandFilter(hz: number): Promise<void>;
  setLnaGain(db: number): Promise<void>;
  setVgaGain(db: number): Promise<void>;
  setAmpEnable(enabled: boolean): Promise<void>;
  startRx(callback: (data: Int8Array) => void): Promise<void>;
  stopStreaming(): Promise<void>;
}

// ---------------------------------------------------------------------------
// IAudioOutput
// ---------------------------------------------------------------------------

export interface IAudioOutput {
  init(): Promise<void>;
  play(samples: Float32Array, sampleRate: number, mode: DemodMode): void;
  stop(): void;
  setVolume(gain: number): void;
  setMuted(muted: boolean): void;
  setOutputDevice(deviceId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// IDSPPipeline
// ---------------------------------------------------------------------------

export interface IDSPPipeline {
  process(rawIQ: Int8Array): DSPResult;
  setMode(mode: DemodMode): void;
  setSampleRate(hz: number): void;
  setOffset(hz: number): void;
  reset(): void;
}
