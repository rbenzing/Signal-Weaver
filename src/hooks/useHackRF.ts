import { useState, useCallback, useRef, useEffect } from 'react';
import { computeSpectrum, FMDemodulator, AMDemodulator, SSBDemodulator, decimate, lowPassFilter } from '@/lib/dsp';
import { AudioOutput } from '@/lib/audio-output';

interface HackRFState {
  isConnected: boolean;
  isActive: boolean;
  serialNumber: string | undefined;
  firmwareVersion: string | undefined;
  spectrumData: number[];
  signalStrength: number;
  peakHold: number;
}

interface UseHackRFOptions {
  mode?: string;
  volume?: number;
  isMuted?: boolean;
}

interface UseHackRFReturn extends HackRFState {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  setFrequency: (freq: number) => Promise<void>;
  setSampleRate: (rate: number) => Promise<void>;
  setLnaGain: (gain: number) => Promise<void>;
  setVgaGain: (gain: number) => Promise<void>;
  setTxVgaGain: (gain: number) => Promise<void>;
  setTxMode: (enabled: boolean) => Promise<void>;
}

const FFT_SIZE = 1024;
const AUDIO_SAMPLE_RATE = 48000;

export const useHackRF = (options: UseHackRFOptions = {}): UseHackRFReturn => {
  const { mode = 'FM', volume = 75, isMuted = false } = options;

  const [state, setState] = useState<HackRFState>({
    isConnected: false,
    isActive: false,
    serialNumber: undefined,
    firmwareVersion: undefined,
    spectrumData: [],
    signalStrength: -100,
    peakHold: -100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const streamingRef = useRef(false);

  // DSP refs
  const fmDemodRef = useRef(new FMDemodulator());
  const amDemodRef = useRef(new AMDemodulator());
  const usbDemodRef = useRef(new SSBDemodulator(true));
  const lsbDemodRef = useRef(new SSBDemodulator(false));
  const audioOutputRef = useRef<AudioOutput | null>(null);
  const sampleRateRef = useRef(10e6);
  const modeRef = useRef(mode);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);

  // Keep refs in sync
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    volumeRef.current = volume;
    audioOutputRef.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    mutedRef.current = isMuted;
    audioOutputRef.current?.setMuted(isMuted);
  }, [isMuted]);

  // I/Q sample accumulation buffer for FFT
  const iqBufferRef = useRef<{ i: Float32Array; q: Float32Array; offset: number }>({
    i: new Float32Array(FFT_SIZE * 2),
    q: new Float32Array(FFT_SIZE * 2),
    offset: 0,
  });

  const connect = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serial' in navigator)) {
        alert('WebSerial is not supported in this browser. Please use Chrome or Edge.');
        return false;
      }

      let port;
      try {
        port = await (navigator as any).serial.requestPort({
          filters: [
            { usbVendorId: 0x1d50, usbProductId: 0x6089 },
            { usbVendorId: 0x1d50, usbProductId: 0x604b },
          ]
        });
      } catch (innerError) {
        if ((innerError as Error).name === 'SecurityError') {
          const currentUrl = window.location.href;
          alert(
            'WebSerial is blocked in embedded iframes.\n\n' +
            'Please open this app in a new browser tab to connect your HackRF device.\n\n' +
            'URL: ' + currentUrl
          );
          window.open(currentUrl, '_blank');
          return false;
        }
        if ((innerError as Error).name === 'NotFoundError') {
          console.log('No HackRF-filtered device found, showing all serial ports...');
          try {
            port = await (navigator as any).serial.requestPort();
          } catch (retryError) {
            if ((retryError as Error).name === 'SecurityError') {
              const currentUrl = window.location.href;
              alert(
                'WebSerial is blocked in embedded iframes.\n\n' +
                'Please open this app in a new browser tab.\n\n' +
                'URL: ' + currentUrl
              );
              window.open(currentUrl, '_blank');
              return false;
            }
            throw retryError;
          }
        } else {
          throw innerError;
        }
      }

      await port.open({ baudRate: 115200 });
      portRef.current = port;

      const info = port.getInfo();

      setState(prev => ({
        ...prev,
        isConnected: true,
        serialNumber: info.usbProductId?.toString(16).toUpperCase() || 'Unknown',
        firmwareVersion: 'v2023.01.1',
      }));

      console.log('HackRF connected:', info);
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        console.log('No device selected');
      } else {
        console.error('Failed to connect to HackRF:', error);
      }
      return false;
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      streamingRef.current = false;

      if (audioOutputRef.current) {
        audioOutputRef.current.stop();
        audioOutputRef.current = null;
      }

      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setState(prev => ({
        ...prev,
        isConnected: false,
        isActive: false,
        serialNumber: undefined,
        firmwareVersion: undefined,
        spectrumData: [],
        signalStrength: -100,
        peakHold: -100,
      }));

      console.log('HackRF disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }, []);

  const processIQData = useCallback((rawBytes: Uint8Array) => {
    // HackRF sends interleaved I/Q as signed 8-bit: I0, Q0, I1, Q1, ...
    const numSamples = Math.floor(rawBytes.length / 2);
    if (numSamples === 0) return;

    const signed = new Int8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const iSamples = new Float32Array(numSamples);
    const qSamples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      iSamples[i] = signed[i * 2] / 128.0;
      qSamples[i] = signed[i * 2 + 1] / 128.0;
    }

    // --- FFT for spectrum display ---
    const buf = iqBufferRef.current;
    const copyLen = Math.min(numSamples, buf.i.length - buf.offset);
    buf.i.set(iSamples.subarray(0, copyLen), buf.offset);
    buf.q.set(qSamples.subarray(0, copyLen), buf.offset);
    buf.offset += copyLen;

    if (buf.offset >= FFT_SIZE) {
      const spectrum = computeSpectrum(
        buf.i.subarray(0, FFT_SIZE),
        buf.q.subarray(0, FFT_SIZE),
        FFT_SIZE
      );

      // Signal strength from spectrum
      let sum = 0;
      let peak = -200;
      for (let i = 0; i < spectrum.length; i++) {
        sum += spectrum[i];
        if (spectrum[i] > peak) peak = spectrum[i];
      }
      const avg = sum / spectrum.length;

      setState(prev => ({
        ...prev,
        spectrumData: Array.from(spectrum),
        signalStrength: avg,
        peakHold: Math.max(prev.peakHold, peak),
      }));

      // Reset buffer
      buf.offset = 0;
    }

    // --- Demodulation for audio ---
    const currentMode = modeRef.current;
    let audioSamples: Float32Array;

    switch (currentMode) {
      case 'FM':
      case 'WFM':
        audioSamples = fmDemodRef.current.demodulate(iSamples, qSamples);
        break;
      case 'AM':
        audioSamples = amDemodRef.current.demodulate(iSamples, qSamples);
        break;
      case 'USB':
        audioSamples = usbDemodRef.current.demodulate(iSamples, qSamples);
        break;
      case 'LSB':
        audioSamples = lsbDemodRef.current.demodulate(iSamples, qSamples);
        break;
      case 'CW':
        // CW is essentially USB with narrow filter
        audioSamples = usbDemodRef.current.demodulate(iSamples, qSamples);
        break;
      case 'RAW':
        // Raw mode: just pass I channel as audio
        audioSamples = iSamples;
        break;
      default:
        audioSamples = fmDemodRef.current.demodulate(iSamples, qSamples);
    }

    // Low-pass filter before decimation
    audioSamples = lowPassFilter(audioSamples, 8);

    // Decimate from device sample rate to audio sample rate
    const decimationFactor = Math.max(1, Math.floor(sampleRateRef.current / AUDIO_SAMPLE_RATE));
    if (decimationFactor > 1) {
      audioSamples = decimate(audioSamples, decimationFactor);
    }

    // Play audio if not muted
    if (!mutedRef.current && audioOutputRef.current) {
      audioOutputRef.current.play(audioSamples);
    }
  }, []);

  const startStreaming = useCallback(async (): Promise<void> => {
    if (!portRef.current || streamingRef.current) return;

    try {
      // Initialize audio output
      const audio = new AudioOutput();
      await audio.init(AUDIO_SAMPLE_RATE);
      audio.setVolume(volumeRef.current);
      if (mutedRef.current) audio.setMuted(true);
      audioOutputRef.current = audio;

      // Reset demodulators
      fmDemodRef.current.reset();
      amDemodRef.current.reset();
      iqBufferRef.current.offset = 0;

      streamingRef.current = true;
      setState(prev => ({ ...prev, isActive: true, peakHold: -100 }));

      const reader = portRef.current.readable?.getReader();
      if (!reader) return;
      readerRef.current = reader;

      // Read loop
      const readLoop = async () => {
        while (streamingRef.current && portRef.current) {
          try {
            const { value, done } = await reader.read();
            if (done || !streamingRef.current) break;
            if (value) {
              processIQData(value);
            }
          } catch (error) {
            if ((error as Error).name !== 'NetworkError') {
              console.error('Read error:', error);
            }
            break;
          }
        }
      };

      readLoop();
    } catch (error) {
      console.error('Failed to start streaming:', error);
      streamingRef.current = false;
      setState(prev => ({ ...prev, isActive: false }));
    }
  }, [processIQData]);

  const stopStreaming = useCallback((): void => {
    streamingRef.current = false;

    if (audioOutputRef.current) {
      audioOutputRef.current.stop();
      audioOutputRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isActive: false,
      spectrumData: [],
      signalStrength: -100,
    }));
  }, []);

  const sendCommand = async (command: Uint8Array): Promise<void> => {
    if (!portRef.current?.writable) return;

    const writer = portRef.current.writable.getWriter();
    try {
      await writer.write(command);
    } finally {
      writer.releaseLock();
    }
  };

  const setFrequency = useCallback(async (freq: number): Promise<void> => {
    // HackRF SET_FREQ: 8 bytes - freq_mhz (u32LE) + freq_hz_remainder (u32LE)
    const freqMhz = Math.floor(freq / 1e6);
    const freqRemainder = Math.floor(freq % 1e6);
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setUint32(0, freqMhz, true);
    view.setUint32(4, freqRemainder, true);
    await sendCommand(data);
    console.log('Set frequency:', freq, 'Hz');
  }, []);

  const setSampleRate = useCallback(async (rate: number): Promise<void> => {
    sampleRateRef.current = rate;
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setUint32(0, Math.floor(rate), true);
    view.setUint32(4, 1, true);
    await sendCommand(data);
    console.log('Set sample rate:', rate);
  }, []);

  const setLnaGain = useCallback(async (gain: number): Promise<void> => {
    const cmd = new Uint8Array([0x03, gain]);
    await sendCommand(cmd);
    console.log('Set LNA gain:', gain);
  }, []);

  const setVgaGain = useCallback(async (gain: number): Promise<void> => {
    const cmd = new Uint8Array([0x04, gain]);
    await sendCommand(cmd);
    console.log('Set VGA gain:', gain);
  }, []);

  const setTxVgaGain = useCallback(async (gain: number): Promise<void> => {
    const cmd = new Uint8Array([0x05, gain]);
    await sendCommand(cmd);
    console.log('Set TX VGA gain:', gain);
  }, []);

  const setTxMode = useCallback(async (enabled: boolean): Promise<void> => {
    const cmd = new Uint8Array([0x06, enabled ? 1 : 0]);
    await sendCommand(cmd);
    console.log('Set TX mode:', enabled);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamingRef.current = false;
      if (audioOutputRef.current) {
        audioOutputRef.current.stop();
      }
      if (readerRef.current) {
        readerRef.current.cancel();
      }
      if (portRef.current) {
        portRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    setFrequency,
    setSampleRate,
    setLnaGain,
    setVgaGain,
    setTxVgaGain,
    setTxMode,
  };
};
