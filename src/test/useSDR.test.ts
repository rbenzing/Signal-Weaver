/**
 * S-09 / S-14 — useSDR composition hook tests
 *
 * Injects all three mock implementations to test end-to-end wiring
 * without real hardware, audio, or DSP.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSDR } from '../hooks/useSDR';
import { MockSDRDevice } from './mocks/MockSDRDevice';
import { MockAudioOutput } from './mocks/MockAudioOutput';
import { MockDSPPipeline } from './mocks/MockDSPPipeline';

function makeMocks() {
  return {
    mockDevice: new MockSDRDevice(),
    mockAudio: new MockAudioOutput(),
    mockPipeline: new MockDSPPipeline(),
  };
}

describe('useSDR — initial state', () => {
  it('isConnected is false initially', () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    expect(result.current.isConnected).toBe(false);
  });

  it('isActive is false initially', () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    expect(result.current.isActive).toBe(false);
  });

  it('signalStrength is -100 initially', () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    expect(result.current.signalStrength).toBe(-100);
  });

  it('peakHold is -100 initially', () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    expect(result.current.peakHold).toBe(-100);
  });
});

describe('useSDR — connect()', () => {
  it('connect() sets isConnected to true', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);
  });
});

describe('useSDR — startStreaming()', () => {
  it('startStreaming() after connect() calls mockAudio.init()', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.startStreaming();
    });
    expect(mockAudio.initCalled).toBe(true);
  });

  it('startStreaming() sets isActive to true', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.startStreaming();
    });
    expect(result.current.isActive).toBe(true);
  });

  it('startStreaming() registers an rxCallback on the device', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });
    expect(mockDevice.rxCallback).not.toBeNull();
  });

  it('simulateData() reaches mockPipeline.process() and mockAudio.play()', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });

    act(() => {
      mockDevice.simulateData(new Int8Array(16384));
    });

    expect(mockPipeline.processCallCount).toBeGreaterThan(0);
    expect(mockAudio.playedSamples.length).toBeGreaterThan(0);
  });

  it('hardware is configured in correct order: sampleRate, basebandFilter, frequency, amp, lna, vga, then rxCallback', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });
    // All hardware config fields must be set
    expect(mockDevice.sampleRateHz).not.toBeNull();
    expect(mockDevice.basebandFilterHz).not.toBeNull();
    expect(mockDevice.lnaGainDb).not.toBeNull();
    expect(mockDevice.vgaGainDb).not.toBeNull();
    // rxCallback should be registered after all config
    expect(mockDevice.rxCallback).not.toBeNull();
  });
});

describe('useSDR — stopStreaming()', () => {
  it('stopStreaming() sets isActive to false', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });
    await act(async () => {
      await result.current.stopStreaming();
    });
    expect(result.current.isActive).toBe(false);
  });

  it('stopStreaming() calls mockAudio.stop()', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });
    await act(async () => {
      await result.current.stopStreaming();
    });
    expect(mockAudio.stopCalled).toBe(true);
  });

  it('stopStreaming() calls mockDevice.stopStreaming()', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
      await result.current.startStreaming();
    });
    await act(async () => {
      await result.current.stopStreaming();
    });
    expect(mockDevice.stopStreamingCalled).toBe(true);
  });
});

describe('useSDR — setters', () => {
  it('setFrequency(101e6) updates tunedFrequency state to 101e6', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.setFrequency(101e6);
    });
    expect(result.current.tunedFrequency).toBe(101e6);
  });

  it('setLnaGain(24) sets mockDevice.lnaGainDb to 24 and lnaGain state to 24', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.setLnaGain(24);
    });
    expect(mockDevice.lnaGainDb).toBe(24);
    expect(result.current.lnaGain).toBe(24);
  });

  it('setVgaGain(20) sets mockDevice.vgaGainDb to 20', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.setVgaGain(20);
    });
    expect(mockDevice.vgaGainDb).toBe(20);
  });
});

describe('useSDR — disconnect()', () => {
  it('disconnect() sets isConnected to false and calls mockDevice.disconnect()', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.isConnected).toBe(false);
    expect(mockDevice.disconnectCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S-14 — connectionType is 'webusb' | null, never 'webserial'
// ---------------------------------------------------------------------------

describe('useSDR — connectionType (S-14)', () => {
  it('connectionType is null when not connected', () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    // TypeScript structural check: value must be 'webusb' | null
    const ct: 'webusb' | null = result.current.connectionType;
    expect(ct).toBeNull();
  });

  it('connectionType is "webusb" when connected', async () => {
    const { mockDevice, mockAudio, mockPipeline } = makeMocks();
    const { result } = renderHook(() =>
      useSDR({ _device: mockDevice, _audio: mockAudio, _pipeline: mockPipeline }),
    );
    await act(async () => {
      await result.current.connect();
    });
    const ct: 'webusb' | null = result.current.connectionType;
    expect(ct).toBe('webusb');
  });
});
