/**
 * useSDR — composition hook that wires useSDRDevice, useDSPPipeline, and useAudioPlayback.
 * Replaces the old useHackRF hook. Accepts injected instances for testability.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ISDRDevice, IAudioOutput, IDSPPipeline, DemodMode } from '@/lib/interfaces';
import { HackRFDevice } from '@/lib/hackrf-usb';
import { DSPPipeline } from '@/lib/dsp-pipeline';
import { AudioOutput } from '@/lib/audio-output';

const DEFAULT_FREQUENCY = 100e6;
const DEFAULT_SAMPLE_RATE = 8e6;
const DEFAULT_BASEBAND_FILTER = 1.75e6;
const DEFAULT_LNA_GAIN = 16;
const DEFAULT_VGA_GAIN = 16;
const DEFAULT_AMP_ENABLED = false;
const DEFAULT_MODE: DemodMode = 'FM';
const PEAK_DECAY = 0.995;

export interface UseSDROptions {
  mode?: DemodMode;
  frequency?: number;
  sampleRate?: number;
  bandwidth?: number;
  lnaGain?: number;
  vgaGain?: number;
  ampEnabled?: boolean;
  volume?: number;
  isMuted?: boolean;
  audioOutputDevice?: string;
  /** Injected device for testing */
  _device?: ISDRDevice;
  /** Injected audio output for testing */
  _audio?: IAudioOutput;
  /** Injected DSP pipeline for testing */
  _pipeline?: IDSPPipeline;
}

interface SDRState {
  isConnected: boolean;
  isActive: boolean;
  serialNumber: string | undefined;
  firmwareVersion: string | undefined;
  signalStrength: number;
  peakHold: number;
  noiseFloor: number;
  tunedFrequency: number;
  centerFrequency: number;
  lnaGain: number;
  vgaGain: number;
  connectionType: 'webusb' | null;
  spectrumData: number[];
}

export function useSDR(options: UseSDROptions = {}) {
  const {
    mode = DEFAULT_MODE,
    frequency = DEFAULT_FREQUENCY,
    sampleRate = DEFAULT_SAMPLE_RATE,
    bandwidth = DEFAULT_BASEBAND_FILTER,
    lnaGain: initLnaGain = DEFAULT_LNA_GAIN,
    vgaGain: initVgaGain = DEFAULT_VGA_GAIN,
    ampEnabled = DEFAULT_AMP_ENABLED,
    volume = 75,
    isMuted = false,
    audioOutputDevice = 'default',
    _device,
    _audio,
    _pipeline,
  } = options;

  // Use injected or create real instances
  const deviceRef = useRef<ISDRDevice>(_device ?? new HackRFDevice());
  const audioRef = useRef<IAudioOutput>(_audio ?? new AudioOutput());
  const pipelineRef = useRef<IDSPPipeline>(
    _pipeline ?? new DSPPipeline(mode, sampleRate, 0),
  );

  // Keep track of whether injected instances changed (for testing, they don't)
  if (_device && deviceRef.current !== _device) deviceRef.current = _device;
  if (_audio && audioRef.current !== _audio) audioRef.current = _audio;
  if (_pipeline && pipelineRef.current !== _pipeline) pipelineRef.current = _pipeline;

  const modeRef = useRef(mode);
  const sampleRateRef = useRef(sampleRate);
  const bandwidthRef = useRef(bandwidth);
  const ampEnabledRef = useRef(ampEnabled);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  const audioDeviceRef = useRef(audioOutputDevice);

  // Sync option refs when props change
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    volumeRef.current = volume;
    audioRef.current.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    mutedRef.current = isMuted;
    audioRef.current.setMuted(isMuted);
  }, [isMuted]);
  useEffect(() => {
    audioDeviceRef.current = audioOutputDevice;
    audioRef.current.setOutputDevice(audioOutputDevice);
  }, [audioOutputDevice]);

  const [state, setState] = useState<SDRState>({
    isConnected: false,
    isActive: false,
    serialNumber: undefined,
    firmwareVersion: undefined,
    signalStrength: -100,
    peakHold: -100,
    noiseFloor: -100,
    tunedFrequency: frequency,
    centerFrequency: frequency,
    lnaGain: initLnaGain,
    vgaGain: initVgaGain,
    connectionType: null,
    spectrumData: [],
  });

  const peakHoldRef = useRef(-100);
  const lnaGainRef = useRef(initLnaGain);
  const vgaGainRef = useRef(initVgaGain);

  // ==================== CONNECT ====================
  const connect = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) {
      console.warn('useSDR: WebUSB not available. Please use Chrome or Edge.');
      return false;
    }
    try {
      const info = await deviceRef.current.connect();
      setState(prev => ({
        ...prev,
        isConnected: true,
        connectionType: 'webusb',
        serialNumber: info.serialNumber,
        firmwareVersion: info.firmwareVersion,
      }));
      return true;
    } catch (err) {
      console.error('useSDR: connect failed', err);
      return false;
    }
  }, []);

  // ==================== DISCONNECT ====================
  const disconnect = useCallback(async (): Promise<void> => {
    audioRef.current.stop();
    await deviceRef.current.disconnect();
    peakHoldRef.current = -100;
    setState(prev => ({
      ...prev,
      isConnected: false,
      isActive: false,
      connectionType: null,
      signalStrength: -100,
      peakHold: -100,
    }));
  }, []);

  // ==================== DATA CALLBACK ====================
  const onIQData = useCallback((data: Int8Array): void => {
    const result = pipelineRef.current.process(data);

    // Peak hold with decay (additive dB decay: ~-0.0435 dB/step toward more negative)
    const newPeak = Math.max(result.peak, peakHoldRef.current + 20 * Math.log10(PEAK_DECAY));
    peakHoldRef.current = newPeak;

    // Route audio
    audioRef.current.play(result.audioSamples, result.audioSampleRate, modeRef.current);

    // Update state (throttled via DSPPipeline internals, but we always update here)
    setState(prev => ({
      ...prev,
      signalStrength: result.signalStrength,
      peakHold: newPeak,
      noiseFloor: result.noiseFloor,
      spectrumData: Array.from(result.spectrumData),
    }));
  }, []);

  // ==================== START STREAMING ====================
  const startStreaming = useCallback(async (): Promise<void> => {
    try {
      // Init audio
      await audioRef.current.init();
      audioRef.current.setVolume(volumeRef.current);
      audioRef.current.setMuted(mutedRef.current);

      // Reset pipeline
      pipelineRef.current.reset();
      peakHoldRef.current = -100;

      // Configure hardware
      const dev = deviceRef.current;
      await dev.setSampleRate(sampleRateRef.current);
      await dev.setBasebandFilter(bandwidthRef.current);
      await dev.setFrequency(state.tunedFrequency);
      await dev.setAmpEnable(ampEnabledRef.current);
      await dev.setLnaGain(lnaGainRef.current);
      await dev.setVgaGain(vgaGainRef.current);

      // Start RX
      await dev.startRx(onIQData);

      setState(prev => ({ ...prev, isActive: true, peakHold: -100 }));
    } catch (err) {
      console.error('useSDR: startStreaming failed', err);
      setState(prev => ({ ...prev, isActive: false }));
    }
  }, [onIQData, state.tunedFrequency]);

  // ==================== STOP STREAMING ====================
  const stopStreaming = useCallback(async (): Promise<void> => {
    audioRef.current.stop();
    await deviceRef.current.stopStreaming();
    setState(prev => ({
      ...prev,
      isActive: false,
      signalStrength: -100,
    }));
  }, []);

  // ==================== SETTERS ====================
  const setFrequency = useCallback(async (freq: number): Promise<void> => {
    setState(prev => ({ ...prev, tunedFrequency: freq }));
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setFrequency(freq);
    }
  }, []);

  const setCenterFrequency = useCallback(async (freq: number): Promise<void> => {
    setState(prev => ({ ...prev, centerFrequency: freq }));
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setFrequency(freq);
    }
  }, []);

  const setLnaGain = useCallback(async (gain: number): Promise<void> => {
    lnaGainRef.current = gain;
    setState(prev => ({ ...prev, lnaGain: gain }));
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setLnaGain(gain);
    }
  }, []);

  const setVgaGain = useCallback(async (gain: number): Promise<void> => {
    vgaGainRef.current = gain;
    setState(prev => ({ ...prev, vgaGain: gain }));
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setVgaGain(gain);
    }
  }, []);

  const setAmpEnable = useCallback(async (enabled: boolean): Promise<void> => {
    ampEnabledRef.current = enabled;
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setAmpEnable(enabled);
    }
  }, []);

  const setSampleRate = useCallback(async (rate: number): Promise<void> => {
    sampleRateRef.current = rate;
    pipelineRef.current.setSampleRate(rate);
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setSampleRate(rate);
    }
  }, []);

  const setBasebandFilter = useCallback(async (bw: number): Promise<void> => {
    bandwidthRef.current = bw;
    if (deviceRef.current.isConnected) {
      await deviceRef.current.setBasebandFilter(bw);
    }
  }, []);

  const setMode = useCallback((newMode: DemodMode): void => {
    modeRef.current = newMode;
    pipelineRef.current.setMode(newMode);
  }, []);

  // setTxMode is a no-op in the new architecture (TX not yet implemented)
  // kept for API compatibility with TransceiverControl
  const setTxMode = useCallback(async (_enabled: boolean): Promise<void> => {
    // TX mode not implemented in the refactored pipeline
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    setFrequency,
    setCenterFrequency,
    setLnaGain,
    setVgaGain,
    setAmpEnable,
    setSampleRate,
    setBasebandFilter,
    setMode,
    setTxMode,
  };
}
