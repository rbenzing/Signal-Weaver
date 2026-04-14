/**
 * S-07 / S-11 — useDSPPipeline hook tests
 *
 * Uses MockDSPPipeline to test spectrum updates, peak hold, throttling,
 * and the PEAK_DECAY_FACTOR export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDSPPipeline, PEAK_DECAY_FACTOR } from '../hooks/useDSPPipeline';
import { MockDSPPipeline } from './mocks/MockDSPPipeline';

// Use fake timers so we can control performance.now() and setTimeout
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDSPPipeline — initial state', () => {
  it('signalStrength is -100 initially', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    expect(result.current.signalStrength).toBe(-100);
  });

  it('peakHold is -100 initially', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    expect(result.current.peakHold).toBe(-100);
  });

  it('spectrumRef.current is a Float32Array of length 1024 initially', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    expect(result.current.spectrumRef.current).toBeInstanceOf(Float32Array);
    expect(result.current.spectrumRef.current.length).toBe(1024);
  });
});

describe('useDSPPipeline — processBlock()', () => {
  it('after processBlock(), spectrumRef.current equals the mock spectrumData', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    expect(result.current.spectrumRef.current).toBe(mock.processResult.spectrumData);
  });

  it('signalStrength updates to -60 after processBlock with 51ms elapsed', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    // Advance time past the 50ms throttle window
    vi.advanceTimersByTime(51);

    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    expect(result.current.signalStrength).toBe(-60);
  });

  it('peakHold is >= -50 after processBlock with 51ms elapsed (mock returns peak: -50)', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    vi.advanceTimersByTime(51);

    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    expect(result.current.peakHold).toBeGreaterThanOrEqual(-50);
  });

  it('processBlock() returns the DSPResult from pipeline.process()', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    let dspResult: ReturnType<typeof result.current.processBlock>;
    act(() => {
      dspResult = result.current.processBlock(new Int8Array(16384));
    });
    expect(dspResult!.audioSamples).toBe(mock.processResult.audioSamples);
  });
});

describe('useDSPPipeline — throttling', () => {
  it('state does not update when called rapidly without time advancing', () => {
    const mock = new MockDSPPipeline();
    mock.processResult = {
      ...mock.processResult,
      signalStrength: -50,
    };
    const { result } = renderHook(() => useDSPPipeline(mock));

    // Call processBlock rapidly without advancing time
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.processBlock(new Int8Array(16384));
      }
    });

    // signalStrength should still be at the initial -100 (no 50ms elapsed)
    expect(result.current.signalStrength).toBe(-100);
  });

  it('state updates after 50ms elapses', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    vi.advanceTimersByTime(60);

    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    expect(result.current.signalStrength).toBe(-60);
  });
});

describe('useDSPPipeline — resetPeak()', () => {
  it('resetPeak() sets peakHold back to -100', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    vi.advanceTimersByTime(60);
    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    act(() => {
      result.current.resetPeak();
    });

    expect(result.current.peakHold).toBe(-100);
  });
});

describe('useDSPPipeline — peakHold decay', () => {
  it('peakHold decays when subsequent blocks return lower peak values', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    // First, set a high peak
    mock.processResult = { ...mock.processResult, peak: -60, signalStrength: -60 };
    vi.advanceTimersByTime(60);
    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });
    const peakAfterFirst = result.current.peakHold;

    // Then process 1000 blocks with a very low peak so hold decays
    mock.processResult = { ...mock.processResult, peak: -100, signalStrength: -100 };
    act(() => {
      for (let i = 0; i < 1000; i++) {
        result.current.processBlock(new Int8Array(16384));
      }
    });
    // Force state update
    vi.advanceTimersByTime(60);
    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });

    // peakHold should have decayed below the initial observed peak
    // After 1000 * 0.995 decay steps from -60: -60 * 0.995^1000 is numerically wrong since
    // values are in dB — the actual decay is: hold = hold * 0.995 each step
    // Starting from ~-60, after 1001 steps: peakHold ≈ -60 * 0.995^1001
    // In linear terms this decays. In dB the value becomes more negative.
    expect(result.current.peakHold).toBeLessThan(peakAfterFirst);
  });

  it('peakHold does NOT decay when no processBlock calls are made', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));

    mock.processResult = { ...mock.processResult, peak: -60 };
    vi.advanceTimersByTime(60);
    act(() => {
      result.current.processBlock(new Int8Array(16384));
    });
    const peakAfterProcessing = result.current.peakHold;

    // Advance time without calling processBlock
    vi.advanceTimersByTime(5000);

    // peakHold should not have changed (decay only happens in processBlock)
    expect(result.current.peakHold).toBe(peakAfterProcessing);
  });
});

// ---------------------------------------------------------------------------
// S-11 — PEAK_DECAY_FACTOR exported constant
// ---------------------------------------------------------------------------

describe('PEAK_DECAY_FACTOR', () => {
  it('is importable as a named export from useDSPPipeline', () => {
    expect(PEAK_DECAY_FACTOR).toBeDefined();
  });

  it('equals 0.995', () => {
    expect(PEAK_DECAY_FACTOR).toBe(0.995);
  });
});

describe('useDSPPipeline — delegation', () => {
  it('setMode() delegates to pipeline.setMode()', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    act(() => {
      result.current.setMode('AM');
    });
    expect(mock.currentMode).toBe('AM');
  });

  it('setSampleRate() delegates to pipeline.setSampleRate()', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    act(() => {
      result.current.setSampleRate(4e6);
    });
    expect(mock.currentSampleRate).toBe(4e6);
  });

  it('setOffset() delegates to pipeline.setOffset()', () => {
    const mock = new MockDSPPipeline();
    const { result } = renderHook(() => useDSPPipeline(mock));
    act(() => {
      result.current.setOffset(100e3);
    });
    expect(mock.currentOffset).toBe(100e3);
  });
});
