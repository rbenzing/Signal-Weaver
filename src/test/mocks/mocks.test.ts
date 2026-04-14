/**
 * S-02 — Mock implementations tests
 *
 * Verifies that MockSDRDevice and MockAudioOutput faithfully implement
 * ISDRDevice and IAudioOutput and record all interactions for assertion.
 */

import { describe, it, expect } from 'vitest';
import type { ISDRDevice, IAudioOutput } from '../../lib/interfaces';
import { MockSDRDevice } from './MockSDRDevice';
import { MockAudioOutput } from './MockAudioOutput';

// ---------------------------------------------------------------------------
// MockSDRDevice
// ---------------------------------------------------------------------------

describe('MockSDRDevice', () => {
  it('satisfies ISDRDevice (TypeScript structural assignment)', () => {
    // TypeScript will fail to compile this assignment if the structural contract is broken.
    const device: ISDRDevice = new MockSDRDevice();
    expect(device).toBeDefined();
  });

  it('initial isConnected is false', () => {
    const device = new MockSDRDevice();
    expect(device.isConnected).toBe(false);
  });

  it('connect() sets isConnected to true', async () => {
    const device = new MockSDRDevice();
    await device.connect();
    expect(device.isConnected).toBe(true);
  });

  it('connect() returns correct HackRFDeviceInfo shape', async () => {
    const device = new MockSDRDevice();
    const info = await device.connect();
    expect(info.boardId).toBe(2);
    expect(info.firmwareVersion).toBe('mock-1.0');
    expect(info.serialNumber).toBe('MOCK00000000');
  });

  it('disconnect() sets isConnected to false and disconnectCalled to true', async () => {
    const device = new MockSDRDevice();
    await device.connect();
    await device.disconnect();
    expect(device.isConnected).toBe(false);
    expect(device.disconnectCalled).toBe(true);
  });

  it('setFrequency(100e6) stores 100e6 in frequencyHz', async () => {
    const device = new MockSDRDevice();
    await device.setFrequency(100e6);
    expect(device.frequencyHz).toBe(100e6);
  });

  it('setLnaGain(24) stores 24 in lnaGainDb', async () => {
    const device = new MockSDRDevice();
    await device.setLnaGain(24);
    expect(device.lnaGainDb).toBe(24);
  });

  it('setSampleRate(4e6) stores 4e6 in sampleRateHz', async () => {
    const device = new MockSDRDevice();
    await device.setSampleRate(4e6);
    expect(device.sampleRateHz).toBe(4e6);
  });

  it('setVgaGain(20) stores 20 in vgaGainDb', async () => {
    const device = new MockSDRDevice();
    await device.setVgaGain(20);
    expect(device.vgaGainDb).toBe(20);
  });

  it('setBasebandFilter(6e6) stores 6e6 in basebandFilterHz', async () => {
    const device = new MockSDRDevice();
    await device.setBasebandFilter(6e6);
    expect(device.basebandFilterHz).toBe(6e6);
  });

  it('setAmpEnable(true) stores true in ampEnabled', async () => {
    const device = new MockSDRDevice();
    await device.setAmpEnable(true);
    expect(device.ampEnabled).toBe(true);
  });

  it('startRx(callback) stores callback in rxCallback', async () => {
    const device = new MockSDRDevice();
    const cb = (_data: Int8Array) => {};
    await device.startRx(cb);
    expect(device.rxCallback).toBe(cb);
  });

  it('simulateData() triggers the registered rxCallback with the passed Int8Array', async () => {
    const device = new MockSDRDevice();
    let received: Int8Array | null = null;
    await device.startRx((data) => { received = data; });
    const chunk = new Int8Array([1, 2, 3, 4]);
    device.simulateData(chunk);
    expect(received).toBe(chunk);
  });

  it('simulateData() before startRx() throws an Error', () => {
    const device = new MockSDRDevice();
    expect(() => device.simulateData(new Int8Array(8))).toThrow(Error);
  });

  it('stopStreaming() sets stopStreamingCalled to true and clears rxCallback', async () => {
    const device = new MockSDRDevice();
    await device.startRx((_data: Int8Array) => {});
    await device.stopStreaming();
    expect(device.stopStreamingCalled).toBe(true);
    expect(device.rxCallback).toBeNull();
  });

  it('makeSineIQ(1000, 8e6, 512) returns Int8Array of length 1024', () => {
    const result = MockSDRDevice.makeSineIQ(1000, 8e6, 512);
    expect(result).toBeInstanceOf(Int8Array);
    expect(result.length).toBe(1024);
  });

  it('makeSineIQ first I-channel sample is cos(0) * amplitude ≈ amplitude', () => {
    const amplitude = 100;
    const result = MockSDRDevice.makeSineIQ(1000, 8e6, 512, amplitude);
    // I is at index 0, should be cos(0) * 100 = 100
    expect(result[0]).toBe(Math.round(Math.cos(0) * amplitude));
  });
});

// ---------------------------------------------------------------------------
// MockAudioOutput
// ---------------------------------------------------------------------------

describe('MockAudioOutput', () => {
  it('satisfies IAudioOutput (TypeScript structural assignment)', () => {
    const audio: IAudioOutput = new MockAudioOutput();
    expect(audio).toBeDefined();
  });

  it('initial state: initCalled is false, stopCalled is false, playedSamples is empty', () => {
    const audio = new MockAudioOutput();
    expect(audio.initCalled).toBe(false);
    expect(audio.stopCalled).toBe(false);
    expect(audio.playedSamples).toHaveLength(0);
  });

  it('init() sets initCalled to true', async () => {
    const audio = new MockAudioOutput();
    await audio.init();
    expect(audio.initCalled).toBe(true);
  });

  it('stop() sets stopCalled to true', () => {
    const audio = new MockAudioOutput();
    audio.stop();
    expect(audio.stopCalled).toBe(true);
  });

  it('play() appends to playedSamples', () => {
    const audio = new MockAudioOutput();
    const samples = new Float32Array(256);
    audio.play(samples, 48000, 'FM');
    expect(audio.playedSamples).toHaveLength(1);
    expect(audio.playedSamples[0].samples).toBe(samples);
    expect(audio.playedSamples[0].sampleRate).toBe(48000);
    expect(audio.playedSamples[0].mode).toBe('FM');
  });

  it('totalSamplesReceived correctly sums across multiple play() calls', () => {
    const audio = new MockAudioOutput();
    audio.play(new Float32Array(100), 48000, 'FM');
    audio.play(new Float32Array(200), 48000, 'AM');
    audio.play(new Float32Array(50), 48000, 'WFM');
    expect(audio.totalSamplesReceived).toBe(350);
  });

  it('setVolume(50) stores 50 in volume', () => {
    const audio = new MockAudioOutput();
    audio.setVolume(50);
    expect(audio.volume).toBe(50);
  });

  it('setMuted(true) stores true in muted', () => {
    const audio = new MockAudioOutput();
    audio.setMuted(true);
    expect(audio.muted).toBe(true);
  });

  it('setMuted(false) stores false in muted', () => {
    const audio = new MockAudioOutput();
    audio.setMuted(true);
    audio.setMuted(false);
    expect(audio.muted).toBe(false);
  });

  it('setOutputDevice() stores the deviceId in outputDeviceId', async () => {
    const audio = new MockAudioOutput();
    await audio.setOutputDevice('device-xyz');
    expect(audio.outputDeviceId).toBe('device-xyz');
  });
});
