/**
 * S-08 — useAudioPlayback hook tests
 *
 * Uses MockAudioOutput to test audio lifecycle, volume, mute, and playback guard.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { MockAudioOutput } from './mocks/MockAudioOutput';

describe('useAudioPlayback — initial state', () => {
  it('isPlaying is false initially', () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    expect(result.current.isPlaying).toBe(false);
  });
});

describe('useAudioPlayback — initAudio()', () => {
  it('initAudio() calls output.init()', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    expect(mock.initCalled).toBe(true);
  });

  it('initAudio() sets isPlaying to true', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    expect(result.current.isPlaying).toBe(true);
  });
});

describe('useAudioPlayback — stopAudio()', () => {
  it('stopAudio() calls output.stop()', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    act(() => {
      result.current.stopAudio();
    });
    expect(mock.stopCalled).toBe(true);
  });

  it('stopAudio() sets isPlaying to false', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    act(() => {
      result.current.stopAudio();
    });
    expect(result.current.isPlaying).toBe(false);
  });
});

describe('useAudioPlayback — playAudio()', () => {
  it('playAudio() after initAudio() appends to mock.playedSamples with correct mode', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    const samples = new Float32Array(256);
    act(() => {
      result.current.playAudio(samples, 48000, 'FM');
    });
    expect(mock.playedSamples).toHaveLength(1);
    expect(mock.playedSamples[0].mode).toBe('FM');
    expect(mock.playedSamples[0].sampleRate).toBe(48000);
    expect(mock.playedSamples[0].samples).toBe(samples);
  });

  it('playAudio() before initAudio() is a no-op', () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    act(() => {
      result.current.playAudio(new Float32Array(256), 48000, 'FM');
    });
    expect(mock.playedSamples).toHaveLength(0);
  });

  it('playAudio() after stopAudio() is a no-op', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.initAudio();
    });
    act(() => {
      result.current.stopAudio();
    });
    act(() => {
      result.current.playAudio(new Float32Array(256), 48000, 'FM');
    });
    // Still zero plays — guard prevents call after stop
    expect(mock.playedSamples).toHaveLength(0);
  });
});

describe('useAudioPlayback — volume and mute', () => {
  it('setVolume(50) calls output.setVolume(50)', () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    act(() => {
      result.current.setVolume(50);
    });
    expect(mock.volume).toBe(50);
  });

  it('setMuted(true) calls output.setMuted(true)', () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    act(() => {
      result.current.setMuted(true);
    });
    expect(mock.muted).toBe(true);
  });

  it('setMuted(false) calls output.setMuted(false)', () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    act(() => {
      result.current.setMuted(true);
    });
    act(() => {
      result.current.setMuted(false);
    });
    expect(mock.muted).toBe(false);
  });

  it('setOutputDevice("device-abc") calls output.setOutputDevice("device-abc")', async () => {
    const mock = new MockAudioOutput();
    const { result } = renderHook(() => useAudioPlayback(mock));
    await act(async () => {
      await result.current.setOutputDevice('device-abc');
    });
    expect(mock.outputDeviceId).toBe('device-abc');
  });
});
