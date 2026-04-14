/**
 * useAudioPlayback — wraps IAudioOutput with React state for audio lifecycle.
 */

import { useState, useCallback } from 'react';
import type { IAudioOutput, DemodMode } from '@/lib/interfaces';

export function useAudioPlayback(output: IAudioOutput) {
  const [isPlaying, setIsPlaying] = useState(false);

  const initAudio = useCallback(async (): Promise<void> => {
    await output.init();
    setIsPlaying(true);
  }, [output]);

  const stopAudio = useCallback((): void => {
    output.stop();
    setIsPlaying(false);
  }, [output]);

  const playAudio = useCallback((
    samples: Float32Array,
    sampleRate: number,
    mode: DemodMode,
  ): void => {
    if (!isPlaying) return;
    output.play(samples, sampleRate, mode);
  }, [output, isPlaying]);

  const setVolume = useCallback((gain: number): void => {
    output.setVolume(gain);
  }, [output]);

  const setMuted = useCallback((muted: boolean): void => {
    output.setMuted(muted);
  }, [output]);

  const setOutputDevice = useCallback(async (deviceId: string): Promise<void> => {
    await output.setOutputDevice(deviceId);
  }, [output]);

  return {
    isPlaying,
    initAudio,
    stopAudio,
    playAudio,
    setVolume,
    setMuted,
    setOutputDevice,
  };
}
