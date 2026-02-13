import { useState, useCallback, useRef, useEffect } from 'react';
import { computeSpectrum, FMDemodulator, AMDemodulator, SSBDemodulator, decimate, lowPassFilter, decimateIQ, getIFDecimationFactor } from '@/lib/dsp';
import { AudioOutput } from '@/lib/audio-output';
import { HackRFDevice } from '@/lib/hackrf-usb';

interface HackRFState {
  isConnected: boolean;
  isActive: boolean;
  serialNumber: string | undefined;
  firmwareVersion: string | undefined;
  spectrumData: number[];
  signalStrength: number;
  peakHold: number;
  connectionType: 'webusb' | 'webserial' | null;
}

interface UseHackRFOptions {
  mode?: string;
  volume?: number;
  isMuted?: boolean;
  frequency?: number;
  sampleRate?: number;
  bandwidth?: number;
  lnaGain?: number;
  vgaGain?: number;
}

interface UseHackRFReturn extends HackRFState {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  setFrequency: (freq: number) => Promise<void>;
  setSampleRate: (rate: number) => Promise<void>;
  setBasebandFilter: (bw: number) => Promise<void>;
  setLnaGain: (gain: number) => Promise<void>;
  setVgaGain: (gain: number) => Promise<void>;
  setTxVgaGain: (gain: number) => Promise<void>;
  setTxMode: (enabled: boolean) => Promise<void>;
}

const FFT_SIZE = 1024;
const AUDIO_SAMPLE_RATE = 48000;

export const useHackRF = (options: UseHackRFOptions = {}): UseHackRFReturn => {
  const { mode = 'FM', volume = 75, isMuted = false, frequency = 100e6, sampleRate = 8e6, bandwidth = 1.75e6, lnaGain = 16, vgaGain = 16 } = options;
  const frequencyRef = useRef(frequency);
  const bandwidthRef = useRef(bandwidth);
  const lnaGainRef = useRef(lnaGain);
  const vgaGainRef = useRef(vgaGain);
  useEffect(() => { frequencyRef.current = frequency; }, [frequency]);
  useEffect(() => { bandwidthRef.current = bandwidth; }, [bandwidth]);
  useEffect(() => { lnaGainRef.current = lnaGain; }, [lnaGain]);
  useEffect(() => { vgaGainRef.current = vgaGain; }, [vgaGain]);

  const [state, setState] = useState<HackRFState>({
    isConnected: false,
    isActive: false,
    serialNumber: undefined,
    firmwareVersion: undefined,
    spectrumData: [],
    signalStrength: -100,
    peakHold: -100,
    connectionType: null,
  });

  // WebUSB device ref
  const hackrfRef = useRef<HackRFDevice | null>(null);

  // WebSerial fallback refs
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
  const sampleRateRef = useRef(8e6);
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

  // I/Q buffer for FFT
  const iqBufferRef = useRef<{ i: Float32Array; q: Float32Array; offset: number }>({
    i: new Float32Array(FFT_SIZE * 2),
    q: new Float32Array(FFT_SIZE * 2),
    offset: 0,
  });
  const diagCountRef = useRef(0);

  // ==================== I/Q PROCESSING ====================
  const processIQData = useCallback((rawBytes: Int8Array | Uint8Array) => {
    const numSamples = Math.floor(rawBytes.length / 2);
    if (numSamples === 0) return;

    const signed = rawBytes instanceof Int8Array ? rawBytes : new Int8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
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
      const spectrum = computeSpectrum(buf.i.subarray(0, FFT_SIZE), buf.q.subarray(0, FFT_SIZE), FFT_SIZE);
      let sum = 0, peak = -200;
      for (let i = 0; i < spectrum.length; i++) {
        sum += spectrum[i];
        if (spectrum[i] > peak) peak = spectrum[i];
      }
      setState(prev => ({
        ...prev,
        spectrumData: Array.from(spectrum),
        signalStrength: sum / spectrum.length,
        peakHold: Math.max(prev.peakHold, peak),
      }));
      buf.offset = 0;
    }

    // --- Demodulation for audio ---
    // Step 1: Decimate I/Q to an appropriate IF rate BEFORE demodulation
    const currentMode = modeRef.current;
    const iqDecimFactor = getIFDecimationFactor(sampleRateRef.current, currentMode);
    
    let demodI: Float32Array = iSamples;
    let demodQ: Float32Array = qSamples;
    if (iqDecimFactor > 1) {
      const decimated = decimateIQ(iSamples, qSamples, iqDecimFactor);
      demodI = decimated.i;
      demodQ = decimated.q;
    }

    // Step 2: Demodulate at the reduced IF rate
    let audioSamples: Float32Array;
    switch (currentMode) {
      case 'FM': case 'WFM':
        audioSamples = fmDemodRef.current.demodulate(demodI, demodQ); break;
      case 'AM':
        audioSamples = amDemodRef.current.demodulate(demodI, demodQ); break;
      case 'USB': case 'CW':
        audioSamples = usbDemodRef.current.demodulate(demodI, demodQ); break;
      case 'LSB':
        audioSamples = lsbDemodRef.current.demodulate(demodI, demodQ); break;
      case 'RAW':
        audioSamples = demodI; break;
      default:
        audioSamples = fmDemodRef.current.demodulate(demodI, demodQ);
    }

    // Step 3: Final decimation from IF rate to audio rate (48kHz)
    const effectiveIFRate = sampleRateRef.current / iqDecimFactor;
    const audioDecimFactor = Math.max(1, Math.round(effectiveIFRate / AUDIO_SAMPLE_RATE));
    if (audioDecimFactor > 1) {
      audioSamples = lowPassFilter(audioSamples, audioDecimFactor * 2);
      audioSamples = decimate(audioSamples, audioDecimFactor);
    }

    // Diagnostic: log first few audio chunks
    diagCountRef.current++;
    if (diagCountRef.current <= 5 || diagCountRef.current % 500 === 0) {
      let maxVal = 0;
      for (let i = 0; i < audioSamples.length; i++) {
        const abs = Math.abs(audioSamples[i]);
        if (abs > maxVal) maxVal = abs;
      }
      console.log(`[Audio] chunk #${diagCountRef.current}: ${audioSamples.length} samples, max amplitude: ${maxVal.toFixed(4)}, mode: ${currentMode}, IQ decim: ${iqDecimFactor}, audio decim: ${audioDecimFactor}, muted: ${mutedRef.current}, hasOutput: ${!!audioOutputRef.current}`);
    }

    if (!mutedRef.current && audioOutputRef.current) {
      audioOutputRef.current.play(audioSamples);
    }
  }, []);

  // ==================== CONNECT ====================
  const connect = useCallback(async (): Promise<boolean> => {
    // Try WebUSB first (proper HackRF protocol with control transfers)
    if ('usb' in navigator) {
      try {
        console.log('Attempting WebUSB connection...');
        const device = new HackRFDevice();
        const info = await device.connect();

        hackrfRef.current = device;
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionType: 'webusb',
          serialNumber: info.serialNumber,
          firmwareVersion: info.firmwareVersion,
        }));
        console.log('Connected via WebUSB ✓');
        return true;
      } catch (error) {
        console.warn('WebUSB failed:', (error as Error).message);
        // If user cancelled the picker, don't fall through
        if ((error as Error).message?.includes('No HackRF device found') ||
            (error as Error).name === 'NotFoundError') {
          // Show helpful message about driver setup
          alert(
            'HackRF not found via WebUSB.\n\n' +
            'If your device shows as a COM port (serial), you need to install the WinUSB driver:\n\n' +
            '1. Download Zadig from https://zadig.akeo.ie/\n' +
            '2. Options → List All Devices\n' +
            '3. Select "HackRF One"\n' +
            '4. Install WinUSB driver\n\n' +
            'After that, reconnect and try again.'
          );
          return false;
        }
        if ((error as Error).message?.includes('iframes')) {
          alert((error as Error).message);
          return false;
        }
        // For other errors, try WebSerial fallback
        console.log('Falling back to WebSerial...');
      }
    }

    // Fallback: WebSerial
    if (!('serial' in navigator)) {
      alert('Neither WebUSB nor WebSerial is supported. Please use Chrome or Edge.');
      return false;
    }

    try {
      // Show ALL serial ports in one picker (no double-prompt)
      const port = await (navigator as any).serial.requestPort();

      await port.open({ baudRate: 115200 });
      portRef.current = port;

      const info = port.getInfo();
      setState(prev => ({
        ...prev,
        isConnected: true,
        connectionType: 'webserial',
        serialNumber: info.usbProductId?.toString(16).toUpperCase() || 'Unknown',
        firmwareVersion: 'Serial mode',
      }));

      console.log('Connected via WebSerial (limited - no USB control transfers)');
      console.warn(
        'WebSerial mode: HackRF requires WebUSB for proper operation.\n' +
        'Install WinUSB driver with Zadig for full functionality.'
      );
      return true;
    } catch (error) {
      if ((error as Error).name === 'SecurityError') {
        const url = window.location.href;
        alert('WebSerial blocked in iframe. Opening in new tab...');
        window.open(url, '_blank');
      } else if ((error as Error).name !== 'NotFoundError') {
        console.error('Serial connection failed:', error);
      }
      return false;
    }
  }, []);

  // ==================== DISCONNECT ====================
  const disconnect = useCallback(async (): Promise<void> => {
    streamingRef.current = false;

    audioOutputRef.current?.stop();
    audioOutputRef.current = null;

    if (hackrfRef.current) {
      await hackrfRef.current.disconnect();
      hackrfRef.current = null;
    }

    if (readerRef.current) {
      await readerRef.current.cancel();
      readerRef.current = null;
    }

    if (portRef.current) {
      await portRef.current.close();
      portRef.current = null;
    }

    setState({
      isConnected: false,
      isActive: false,
      serialNumber: undefined,
      firmwareVersion: undefined,
      spectrumData: [],
      signalStrength: -100,
      peakHold: -100,
      connectionType: null,
    });
    console.log('HackRF disconnected');
  }, []);

  // ==================== STREAMING ====================
  const initAudio = async () => {
    const audio = new AudioOutput();
    await audio.init(AUDIO_SAMPLE_RATE);
    audio.setVolume(volumeRef.current);
    if (mutedRef.current) audio.setMuted(true);
    audioOutputRef.current = audio;

    fmDemodRef.current.reset();
    amDemodRef.current.reset();
    iqBufferRef.current.offset = 0;
  };

  const startStreaming = useCallback(async (): Promise<void> => {
    if (streamingRef.current) return;

    try {
      await initAudio();
      streamingRef.current = true;
      setState(prev => ({ ...prev, isActive: true, peakHold: -100 }));

      if (hackrfRef.current) {
        const dev = hackrfRef.current;
        const freq = frequencyRef.current;
        const sr = sampleRateRef.current;
        const bw = bandwidthRef.current;
        
        console.log(`HackRF: Configuring → freq=${(freq / 1e6).toFixed(3)} MHz, SR=${(sr / 1e6).toFixed(1)} MS/s, BW=${(bw / 1e6).toFixed(2)} MHz`);
        
        // Step 1: Configure baseband parameters BEFORE RX
        await dev.setSampleRate(sr);
        await dev.setBasebandFilter(bw);
        await dev.setFrequency(freq);
        
        // Step 2: Enter RX mode FIRST — HackRF ignores gain commands until transceiver is active
        await dev.startRx((samples: Int8Array) => {
          processIQData(samples);
        });
        
        // Step 3: Set gains AFTER entering RX mode (required by HackRF hardware)
        await dev.setAmpEnable(false);
        await dev.setLnaGain(lnaGainRef.current);
        await dev.setVgaGain(vgaGainRef.current);
        console.log(`HackRF: Gains applied post-RX → LNA=${lnaGainRef.current} dB, VGA=${vgaGainRef.current} dB, Amp=OFF`);
      } else if (portRef.current) {
        // WebSerial fallback path
        const reader = portRef.current.readable?.getReader();
        if (!reader) {
          throw new Error('Could not get readable stream');
        }
        readerRef.current = reader;

        const readLoop = async () => {
          while (streamingRef.current) {
            try {
              const { value, done } = await reader.read();
              if (done || !streamingRef.current) break;
              if (value) processIQData(value);
            } catch (error) {
              if ((error as Error).name !== 'NetworkError') {
                console.error('Read error:', error);
              }
              break;
            }
          }
        };
        readLoop();
      } else {
        throw new Error('No device connected');
      }
    } catch (error) {
      console.error('Failed to start streaming:', error);
      streamingRef.current = false;
      setState(prev => ({ ...prev, isActive: false }));
    }
  }, [processIQData]);

  const stopStreaming = useCallback((): void => {
    streamingRef.current = false;

    if (hackrfRef.current) {
      hackrfRef.current.stopStreaming().catch(console.error);
    }

    audioOutputRef.current?.stop();
    audioOutputRef.current = null;

    setState(prev => ({
      ...prev,
      isActive: false,
      spectrumData: [],
      signalStrength: -100,
    }));
  }, []);

  // ==================== DEVICE CONTROLS ====================
  const setFrequency = useCallback(async (freq: number): Promise<void> => {
    if (hackrfRef.current) {
      await hackrfRef.current.setFrequency(freq);
    }
    // WebSerial can't send control transfers, so this is a no-op in serial mode
    console.log('Set frequency:', (freq / 1e6).toFixed(3), 'MHz');
  }, []);

  const setSampleRate = useCallback(async (rate: number): Promise<void> => {
    sampleRateRef.current = rate;
    if (hackrfRef.current) {
      await hackrfRef.current.setSampleRate(rate);
    }
    console.log('Set sample rate:', (rate / 1e6).toFixed(1), 'MS/s');
  }, []);

  const setBasebandFilter = useCallback(async (bw: number): Promise<void> => {
    bandwidthRef.current = bw;
    if (hackrfRef.current) {
      await hackrfRef.current.setBasebandFilter(bw);
    }
    console.log('Set baseband filter:', (bw / 1e6).toFixed(2), 'MHz');
  }, []);

  const setLnaGain = useCallback(async (gain: number): Promise<void> => {
    if (hackrfRef.current) {
      await hackrfRef.current.setLnaGain(gain);
    }
    console.log('Set LNA gain:', gain, 'dB');
  }, []);

  const setVgaGain = useCallback(async (gain: number): Promise<void> => {
    if (hackrfRef.current) {
      await hackrfRef.current.setVgaGain(gain);
    }
    console.log('Set VGA gain:', gain, 'dB');
  }, []);

  const setTxVgaGain = useCallback(async (gain: number): Promise<void> => {
    if (hackrfRef.current) {
      await hackrfRef.current.setTxVgaGain(gain);
    }
    console.log('Set TX VGA gain:', gain, 'dB');
  }, []);

  const setTxMode = useCallback(async (enabled: boolean): Promise<void> => {
    if (hackrfRef.current) {
      if (enabled) {
        await hackrfRef.current.startTx();
      } else {
        await hackrfRef.current.stopStreaming();
      }
    }
    console.log('Set TX mode:', enabled);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamingRef.current = false;
      audioOutputRef.current?.stop();
      hackrfRef.current?.disconnect().catch(() => {});
      readerRef.current?.cancel();
      portRef.current?.close();
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
    setBasebandFilter,
    setLnaGain,
    setVgaGain,
    setTxVgaGain,
    setTxMode,
  };
};
