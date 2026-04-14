/**
 * useDSPPipeline — wraps IDSPPipeline with React state for spectrum/signal updates.
 * Exposes a spectrumRef (MutableRefObject) so canvas can read it without re-renders.
 */

import { useState, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { IDSPPipeline, DSPResult, DemodMode } from '@/lib/interfaces';

export const PEAK_DECAY_FACTOR = 0.995;

const THROTTLE_MS = 50;

interface DSPPipelineState {
  signalStrength: number;
  peakHold: number;
  noiseFloor: number;
}

export function useDSPPipeline(pipeline: IDSPPipeline) {
  const [state, setState] = useState<DSPPipelineState>({
    signalStrength: -100,
    peakHold: -100,
    noiseFloor: -100,
  });

  const spectrumRef: MutableRefObject<Float32Array> = useRef(new Float32Array(1024));
  const peakHoldRef = useRef(-100);
  const lastUpdateRef = useRef(0);

  const processBlock = useCallback((data: Int8Array): DSPResult => {
    const result = pipeline.process(data);

    // Always update spectrumRef immediately (no throttle — canvas reads it via rAF)
    spectrumRef.current = result.spectrumData;

    // Apply peak decay
    const currentPeak = result.peak;
    const prevPeak = peakHoldRef.current;
    const newPeak = currentPeak >= prevPeak
      ? currentPeak
      : prevPeak + 20 * Math.log10(PEAK_DECAY_FACTOR);
    peakHoldRef.current = newPeak;

    // Throttle React state updates to ~20fps
    const now = performance.now();
    if (now - lastUpdateRef.current >= THROTTLE_MS) {
      lastUpdateRef.current = now;
      setState({
        signalStrength: result.signalStrength,
        peakHold: newPeak,
        noiseFloor: result.noiseFloor ?? -100,
      });
    }

    return result;
  }, [pipeline]);

  const resetPeak = useCallback((): void => {
    peakHoldRef.current = -100;
    setState(prev => ({ ...prev, peakHold: -100 }));
  }, []);

  const setMode = useCallback((mode: DemodMode): void => {
    pipeline.setMode(mode);
  }, [pipeline]);

  const setSampleRate = useCallback((hz: number): void => {
    pipeline.setSampleRate(hz);
  }, [pipeline]);

  const setOffset = useCallback((hz: number): void => {
    pipeline.setOffset(hz);
  }, [pipeline]);

  return {
    ...state,
    spectrumRef,
    processBlock,
    resetPeak,
    setMode,
    setSampleRate,
    setOffset,
  };
}
