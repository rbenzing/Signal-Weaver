/**
 * useSDRDevice — manages connection lifecycle for an ISDRDevice.
 * Accepts an injected device instance for testability.
 */

import { useState, useCallback } from 'react';
import type { ISDRDevice } from '@/lib/interfaces';

interface SDRDeviceState {
  isConnected: boolean;
  isStreaming: boolean;
  serialNumber: string | undefined;
  firmwareVersion: string | undefined;
}

// Default hardware configuration used when starting RX
const DEFAULT_SAMPLE_RATE = 8e6;
const DEFAULT_BASEBAND_FILTER = 1.75e6;
const DEFAULT_LNA_GAIN = 16;
const DEFAULT_VGA_GAIN = 16;
const DEFAULT_AMP_ENABLED = false;

export function useSDRDevice(device: ISDRDevice) {
  const [state, setState] = useState<SDRDeviceState>({
    isConnected: false,
    isStreaming: false,
    serialNumber: undefined,
    firmwareVersion: undefined,
  });

  const connect = useCallback(async (): Promise<boolean> => {
    // S-14: Require WebUSB — no WebSerial fallback
    if (typeof navigator === 'undefined' || !('usb' in (navigator as Navigator & { usb?: unknown }))) {
      console.warn('useSDRDevice: WebUSB not available. Please use Chrome or Edge.');
      return false;
    }
    try {
      const info = await device.connect();
      setState(prev => ({
        ...prev,
        isConnected: true,
        serialNumber: info.serialNumber,
        firmwareVersion: info.firmwareVersion,
      }));
      return true;
    } catch (err) {
      console.error('useSDRDevice: connect failed', err);
      return false;
    }
  }, [device]);

  const disconnect = useCallback(async (): Promise<void> => {
    await device.disconnect();
    setState(prev => ({
      ...prev,
      isConnected: false,
      isStreaming: false,
    }));
  }, [device]);

  const setFrequency = useCallback(async (hz: number): Promise<void> => {
    if (!device.isConnected) return;
    await device.setFrequency(hz);
  }, [device]);

  const setSampleRate = useCallback(async (hz: number): Promise<void> => {
    if (!device.isConnected) return;
    await device.setSampleRate(hz);
  }, [device]);

  const setBasebandFilter = useCallback(async (hz: number): Promise<void> => {
    if (!device.isConnected) return;
    await device.setBasebandFilter(hz);
  }, [device]);

  const setLnaGain = useCallback(async (db: number): Promise<void> => {
    if (!device.isConnected) return;
    await device.setLnaGain(db);
  }, [device]);

  const setVgaGain = useCallback(async (db: number): Promise<void> => {
    if (!device.isConnected) return;
    await device.setVgaGain(db);
  }, [device]);

  const setAmpEnable = useCallback(async (enabled: boolean): Promise<void> => {
    if (!device.isConnected) return;
    await device.setAmpEnable(enabled);
  }, [device]);

  const startRx = useCallback(async (callback: (data: Int8Array) => void): Promise<void> => {
    // Configure hardware before entering RX mode
    await device.setSampleRate(DEFAULT_SAMPLE_RATE);
    await device.setBasebandFilter(DEFAULT_BASEBAND_FILTER);
    await device.setLnaGain(DEFAULT_LNA_GAIN);
    await device.setVgaGain(DEFAULT_VGA_GAIN);
    await device.setAmpEnable(DEFAULT_AMP_ENABLED);
    await device.startRx(callback);
    setState(prev => ({ ...prev, isStreaming: true }));
  }, [device]);

  const stopRx = useCallback(async (): Promise<void> => {
    await device.stopStreaming();
    setState(prev => ({ ...prev, isStreaming: false }));
  }, [device]);

  return {
    ...state,
    connect,
    disconnect,
    setFrequency,
    setSampleRate,
    setBasebandFilter,
    setLnaGain,
    setVgaGain,
    setAmpEnable,
    startRx,
    stopRx,
  };
}
