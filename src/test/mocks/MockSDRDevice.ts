/**
 * S-02 — MockSDRDevice
 *
 * Zero-dependency test double for ISDRDevice.
 * Records all method calls for assertion and supports synthetic I/Q injection.
 */

import type { ISDRDevice, HackRFDeviceInfo } from '../../lib/interfaces';

export class MockSDRDevice implements ISDRDevice {
  // Recorded state —————————————————————————————————————————————————————————
  private _isConnected = false;
  frequencyHz: number | null = null;
  sampleRateHz: number | null = null;
  basebandFilterHz: number | null = null;
  lnaGainDb: number | null = null;
  vgaGainDb: number | null = null;
  ampEnabled: boolean | null = null;
  rxCallback: ((data: Int8Array) => void) | null = null;
  disconnectCalled = false;
  stopStreamingCalled = false;

  // ISDRDevice ——————————————————————————————————————————————————————————————
  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<HackRFDeviceInfo> {
    this._isConnected = true;
    return { boardId: 2, firmwareVersion: 'mock-1.0', serialNumber: 'MOCK00000000' };
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.disconnectCalled = true;
  }

  async setFrequency(hz: number): Promise<void> {
    this.frequencyHz = hz;
  }

  async setSampleRate(hz: number): Promise<void> {
    this.sampleRateHz = hz;
  }

  async setBasebandFilter(hz: number): Promise<void> {
    this.basebandFilterHz = hz;
  }

  async setLnaGain(db: number): Promise<void> {
    this.lnaGainDb = db;
  }

  async setVgaGain(db: number): Promise<void> {
    this.vgaGainDb = db;
  }

  async setAmpEnable(enabled: boolean): Promise<void> {
    this.ampEnabled = enabled;
  }

  async startRx(callback: (data: Int8Array) => void): Promise<void> {
    this.rxCallback = callback;
  }

  async stopStreaming(): Promise<void> {
    this.stopStreamingCalled = true;
    this.rxCallback = null;
  }

  // Test helpers ————————————————————————————————————————————————————————————

  /** Push synthetic IQ data to the registered callback. Throws if not started. */
  simulateData(data: Int8Array): void {
    if (!this.rxCallback) {
      throw new Error('MockSDRDevice: simulateData() called before startRx()');
    }
    this.rxCallback(data);
  }

  /**
   * Generate interleaved I/Q sine-wave data.
   * I (cosine) at even indices, Q (sine) at odd indices.
   */
  static makeSineIQ(
    frequencyHz: number,
    sampleRate: number,
    numSamples: number,
    amplitude = 100,
  ): Int8Array {
    const result = new Int8Array(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const phase = (2 * Math.PI * frequencyHz * i) / sampleRate;
      result[i * 2]     = Math.round(Math.cos(phase) * amplitude); // I
      result[i * 2 + 1] = Math.round(Math.sin(phase) * amplitude); // Q
    }
    return result;
  }
}
