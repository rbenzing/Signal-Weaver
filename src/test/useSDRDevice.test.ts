/**
 * S-06 / S-14 — useSDRDevice hook tests
 *
 * Uses MockSDRDevice to test the hook lifecycle without real hardware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSDRDevice } from '../hooks/useSDRDevice';
import { MockSDRDevice } from './mocks/MockSDRDevice';

describe('useSDRDevice — initial state', () => {
  it('isConnected is false initially', () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    expect(result.current.isConnected).toBe(false);
  });

  it('isStreaming is false initially', () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    expect(result.current.isStreaming).toBe(false);
  });

  it('serialNumber is undefined initially', () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    expect(result.current.serialNumber).toBeUndefined();
  });

  it('firmwareVersion is undefined initially', () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    expect(result.current.firmwareVersion).toBeUndefined();
  });
});

describe('useSDRDevice — connect()', () => {
  it('connect() sets isConnected to true', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('connect() returns true on success', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    let connectResult: boolean | undefined;
    await act(async () => {
      connectResult = await result.current.connect();
    });
    expect(connectResult).toBe(true);
  });

  it('connect() populates serialNumber from device info', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.serialNumber).toBe('MOCK00000000');
  });

  it('connect() populates firmwareVersion from device info', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.firmwareVersion).toBe('mock-1.0');
  });
});

describe('useSDRDevice — setFrequency()', () => {
  it('setFrequency(100e6) after connect() calls device.setFrequency(100e6)', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.setFrequency(100e6);
    });
    expect(mock.frequencyHz).toBe(100e6);
  });

  it('setFrequency() before connect() is a no-op (device.setFrequency is not called)', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.setFrequency(100e6);
    });
    // Should not have been called on a disconnected device
    expect(mock.frequencyHz).toBeNull();
  });
});

describe('useSDRDevice — startRx() and stopRx()', () => {
  it('startRx() sets isStreaming to true', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.startRx((_data: Int8Array) => {});
    });
    expect(result.current.isStreaming).toBe(true);
  });

  it('startRx() configures hardware: sampleRateHz, basebandFilterHz, lnaGainDb, vgaGainDb all set before rxCallback assigned', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    // Before startRx — nothing configured
    expect(mock.rxCallback).toBeNull();
    await act(async () => {
      await result.current.startRx((_data: Int8Array) => {});
    });
    // After startRx — hardware parameters must all be set
    expect(mock.sampleRateHz).not.toBeNull();
    expect(mock.basebandFilterHz).not.toBeNull();
    expect(mock.lnaGainDb).not.toBeNull();
    expect(mock.vgaGainDb).not.toBeNull();
    expect(mock.rxCallback).not.toBeNull();
  });

  it('stopRx() sets isStreaming to false', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
      await result.current.startRx((_data: Int8Array) => {});
    });
    await act(async () => {
      await result.current.stopRx();
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('stopRx() calls device.stopStreaming()', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
      await result.current.startRx((_data: Int8Array) => {});
    });
    await act(async () => {
      await result.current.stopRx();
    });
    expect(mock.stopStreamingCalled).toBe(true);
  });
});

describe('useSDRDevice — disconnect()', () => {
  it('disconnect() sets isConnected to false', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.isConnected).toBe(false);
  });

  it('disconnect() calls device.disconnect()', async () => {
    const mock = new MockSDRDevice();
    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });
    expect(mock.disconnectCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S-14 — WebUSB availability check
// ---------------------------------------------------------------------------

describe('useSDRDevice — WebUSB availability (S-14)', () => {
  it('connect() returns false when navigator.usb is undefined', async () => {
    const mock = new MockSDRDevice();
    // Simulate a browser without WebUSB
    type NavWithUsb = Navigator & { usb?: unknown };
    const nav = navigator as NavWithUsb;
    const originalUsb = nav.usb;
    delete nav.usb;

    const { result } = renderHook(() => useSDRDevice(mock));
    let connectResult: boolean | undefined;
    await act(async () => {
      connectResult = await result.current.connect();
    });

    // Restore
    if (originalUsb !== undefined) {
      nav.usb = originalUsb;
    }

    expect(connectResult).toBe(false);
  });

  it('connect() does not call device.connect() when navigator.usb is absent', async () => {
    const mock = new MockSDRDevice();
    type NavWithUsb = Navigator & { usb?: unknown };
    const nav = navigator as NavWithUsb;
    const originalUsb = nav.usb;
    delete nav.usb;

    const { result } = renderHook(() => useSDRDevice(mock));
    await act(async () => {
      await result.current.connect();
    });

    if (originalUsb !== undefined) {
      nav.usb = originalUsb;
    }

    // device.connect() should not have been called
    expect(mock.isConnected).toBe(false);
  });
});
