import { useState, useCallback, useRef, useEffect } from 'react';
import { computeSpectrum, FMDemodulator, AMDemodulator, SSBDemodulator, DeemphasisFilter, DCBlocker, StatefulMovingAverage, FrequencyTranslator, decimate, getIFDecimationFactor } from '@/lib/dsp';
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
  centerFrequency: number;  // Hardware tuned frequency
  tunedFrequency: number;    // DSP-translated frequency (what user is listening to)
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
  ampEnabled?: boolean;
  audioOutputDevice?: string;
}

interface UseHackRFReturn extends HackRFState {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  setFrequency: (freq: number) => Promise<void>;
  setCenterFrequency: (freq: number) => Promise<void>;
  setSampleRate: (rate: number) => Promise<void>;
  setBasebandFilter: (bw: number) => Promise<void>;
  setLnaGain: (gain: number) => Promise<void>;
  setVgaGain: (gain: number) => Promise<void>;
  setAmpEnable: (enabled: boolean) => Promise<void>;
  setTxMode: (enabled: boolean) => Promise<void>;
}

const FFT_SIZE = 1024;
const AUDIO_SAMPLE_RATE = 48000;

export const useHackRF = (options: UseHackRFOptions = {}): UseHackRFReturn => {
  const { mode = 'FM', volume = 75, isMuted = false, frequency = 100e6, sampleRate = 8e6, bandwidth = 1.75e6, lnaGain = 16, vgaGain = 16, ampEnabled = false, audioOutputDevice = 'default' } = options;

  // Center frequency vs tuned frequency architecture:
  // - centerFrequency: where HackRF hardware is tuned (stays relatively stable)
  // - tunedFrequency: where user wants to listen (can change frequently)
  // - frequencyOffset: tunedFrequency - centerFrequency (applied via DSP translation)
  const centerFrequencyRef = useRef(frequency);
  const tunedFrequencyRef = useRef(frequency);
  const frequencyOffsetRef = useRef(0);

  const bandwidthRef = useRef(bandwidth);
  const lnaGainRef = useRef(lnaGain);
  const vgaGainRef = useRef(vgaGain);
  const ampEnabledRef = useRef(ampEnabled);
  useEffect(() => { bandwidthRef.current = bandwidth; }, [bandwidth]);
  useEffect(() => { sampleRateRef.current = sampleRate; }, [sampleRate]);
  useEffect(() => { lnaGainRef.current = lnaGain; }, [lnaGain]);
  useEffect(() => { vgaGainRef.current = vgaGain; }, [vgaGain]);
  useEffect(() => { ampEnabledRef.current = ampEnabled; }, [ampEnabled]);

  const [state, setState] = useState<HackRFState>({
    isConnected: false,
    isActive: false,
    serialNumber: undefined,
    firmwareVersion: undefined,
    spectrumData: [],
    signalStrength: -100,
    peakHold: -100,
    connectionType: null,
    centerFrequency: frequency,
    tunedFrequency: frequency,
  });

  // WebUSB device ref
  const hackrfRef = useRef<HackRFDevice | null>(null);

  // WebSerial fallback refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const streamingRef = useRef(false);

  // ==================== CLEANUP ====================
  // Tears down all resources without touching React state. Safe to call from
  // event handlers and async loops as well as the intentional disconnect path.
  const cleanupResources = useCallback(() => {
    streamingRef.current = false;
    audioOutputRef.current?.stop();
    audioOutputRef.current = null;
    // Cancel the reader before closing the port — Web Serial requires all stream
    // locks to be released before port.close() will succeed.
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    const port = portRef.current;
    portRef.current = null;
    port?.close().catch(() => {});
    hackrfRef.current?.disconnect().catch(() => {});
    hackrfRef.current = null;
  }, []);

  // Called when the connection drops unexpectedly (physical unplug, read error, etc.)
  const handleUnexpectedDisconnect = useCallback(() => {
    cleanupResources();
    setState({
      isConnected: false,
      isActive: false,
      serialNumber: undefined,
      firmwareVersion: undefined,
      spectrumData: [],
      signalStrength: -100,
      peakHold: -100,
      connectionType: null,
      centerFrequency: 100e6,
      tunedFrequency: 100e6,
    });
    console.warn('HackRF: connection lost unexpectedly');
  }, [cleanupResources]);

  // Store in a ref so async read loops always see the latest version without
  // needing to be re-created when the callback identity changes.
  const handleUnexpectedDisconnectRef = useRef(handleUnexpectedDisconnect);
  useEffect(() => {
    handleUnexpectedDisconnectRef.current = handleUnexpectedDisconnect;
  }, [handleUnexpectedDisconnect]);

  // DSP refs
  const fmDemodRef = useRef(new FMDemodulator());
  const amDemodRef = useRef(new AMDemodulator());
  const usbDemodRef = useRef(new SSBDemodulator(true));
  const lsbDemodRef = useRef(new SSBDemodulator(false));
  // De-emphasis filter for FM/WFM: recreated when effective audio rate changes
  const deemphasisFilterRef = useRef<DeemphasisFilter | null>(null);
  const lastEffectiveAudioRateRef = useRef(0);
  // DC blocker: removes HackRF's LO-leakage spike at the tuned frequency
  const dcBlockerRef = useRef(new DCBlocker());
  // Frequency translator: shifts signal from center frequency to tuned frequency
  const frequencyTranslatorRef = useRef(new FrequencyTranslator());
  // Stateful lowpass filters: carry history across USB transfer boundaries to
  // eliminate the 976 Hz amplitude pulse that was creating the "tiss tiss" noise
  const iqLPFIRef  = useRef<StatefulMovingAverage | null>(null);
  const iqLPFQRef  = useRef<StatefulMovingAverage | null>(null);
  const audioLPFRef = useRef<StatefulMovingAverage | null>(null);
  const audioOutputRef = useRef<AudioOutput | null>(null);
  const sampleRateRef = useRef(sampleRate);
  const modeRef = useRef(mode);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  const audioDeviceRef = useRef(audioOutputDevice);

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
  useEffect(() => {
    audioDeviceRef.current = audioOutputDevice;
    audioOutputRef.current?.setOutputDevice(audioOutputDevice);
  }, [audioOutputDevice]);

  // Update frequency translation when user changes frequency
  useEffect(() => {
    tunedFrequencyRef.current = frequency;
    const offset = frequency - centerFrequencyRef.current;
    frequencyOffsetRef.current = offset;
    frequencyTranslatorRef.current.setOffset(offset, sampleRateRef.current);
    setState(prev => ({ ...prev, tunedFrequency: frequency }));
  }, [frequency]);

  // I/Q buffer for FFT
  const iqBufferRef = useRef<{ i: Float32Array; q: Float32Array; offset: number }>({
    i: new Float32Array(FFT_SIZE * 2),
    q: new Float32Array(FFT_SIZE * 2),
    offset: 0,
  });

  // Pre-allocated I/Q sample buffers — reused each call to avoid creating
  // ~32 KB of garbage per USB transfer (~976/sec at 8 MS/s), which was
  // causing periodic GC pauses that starved the audio scheduler.
  const iqSampleBufRef = useRef({ i: new Float32Array(8192), q: new Float32Array(8192) });

  // Throttle spectrum/signal-meter setState to ~20 fps. Without this, React
  // re-renders ~976×/sec, each creating a new 1024-element Array.from(spectrum),
  // compounding the GC pressure and main-thread congestion.
  const lastSpectrumUpdateRef = useRef(0);

  // HackRF hardware produces startup transients in the first ~100k samples.
  // Discard these to avoid corrupting the demodulator state and FFT display.
  const samplesDiscardedRef = useRef(0);
  const SAMPLES_TO_DISCARD = 100000;

  // Diagnostic logging: track audio output levels to help debug FM reception issues
  const lastDiagnosticLogRef = useRef(0);
  const DIAGNOSTIC_LOG_INTERVAL_MS = 3000;

  // ==================== I/Q PROCESSING ====================
  const processIQData = useCallback((rawBytes: Int8Array | Uint8Array) => {
    const numSamples = Math.floor(rawBytes.length / 2);
    if (numSamples === 0) return;

    // Discard first 100k samples to skip HackRF hardware startup transients
    if (samplesDiscardedRef.current < SAMPLES_TO_DISCARD) {
      samplesDiscardedRef.current += numSamples;
      if (samplesDiscardedRef.current === numSamples) {
        console.log('HackRF: Discarding first 100k samples (hardware transients)...');
      }
      if (samplesDiscardedRef.current >= SAMPLES_TO_DISCARD) {
        console.log(`HackRF: Transients cleared, starting DSP (discarded ${samplesDiscardedRef.current} samples)`);
      }
      return;
    }

    const signed = rawBytes instanceof Int8Array ? rawBytes : new Int8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

    // Grow pre-allocated buffers only if an unexpectedly large transfer arrives.
    // In normal operation the HackRF always sends 16384-byte (8192-sample) blocks.
    const iqBuf = iqSampleBufRef.current;
    if (iqBuf.i.length < numSamples) {
      iqBuf.i = new Float32Array(numSamples);
      iqBuf.q = new Float32Array(numSamples);
    }
    // Use subarray views — zero allocation, shares the underlying ArrayBuffer.
    const iSamples = iqBuf.i.subarray(0, numSamples);
    const qSamples = iqBuf.q.subarray(0, numSamples);

    for (let i = 0; i < numSamples; i++) {
      iSamples[i] = signed[i * 2] / 128.0;
      qSamples[i] = signed[i * 2 + 1] / 128.0;
    }

    // Remove HackRF DC offset before anything else. The LO-leakage spike sits at
    // exactly the tuned frequency (0 Hz baseband). If left in, it swamps the FM
    // discriminator and the spectrum display shows a false peak at centre.
    dcBlockerRef.current.process(iSamples, qSamples);

    // Frequency translation: shift signal from hardware center frequency to user's tuned frequency
    // This allows us to keep HackRF tuned to a fixed center while digitally tuning within the bandwidth
    frequencyTranslatorRef.current.translate(iSamples, qSamples);

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
      // Throttle UI updates to ~20 fps. Without this, setState fires ~976×/sec
      // (once per USB transfer), triggering React re-renders at the same rate
      // and creating ~8 KB of Array.from(spectrum) garbage each time — both
      // contribute to GC pauses that cause the periodic audio hiss dropout.
      const nowMs = performance.now();
      if (nowMs - lastSpectrumUpdateRef.current >= 50) {
        lastSpectrumUpdateRef.current = nowMs;
        setState(prev => ({
          ...prev,
          spectrumData: Array.from(spectrum),
          signalStrength: sum / spectrum.length,
          peakHold: Math.max(prev.peakHold, peak),
        }));
      }
      buf.offset = 0;
    }

    // --- Demodulation for audio ---
    // Step 1: Decimate I/Q to an appropriate IF rate BEFORE demodulation
    const currentMode = modeRef.current;
    const iqDecimFactor = getIFDecimationFactor(sampleRateRef.current, currentMode);
    
    let demodI: Float32Array = iSamples;
    let demodQ: Float32Array = qSamples;
    if (iqDecimFactor > 1) {
      // Stateful IQ lowpass: preserves filter history across USB transfer boundaries,
      // eliminating the start-of-block amplitude transient that was part of the tiss artifact.
      const iqTaps = Math.min(iqDecimFactor, 64);
      if (!iqLPFIRef.current || iqLPFIRef.current.taps !== iqTaps) {
        iqLPFIRef.current = new StatefulMovingAverage(iqTaps);
        iqLPFQRef.current = new StatefulMovingAverage(iqTaps);
      }
      const filtI = iqLPFIRef.current.process(iSamples);
      const filtQ = iqLPFQRef.current!.process(qSamples);
      demodI = decimate(filtI, iqDecimFactor);
      demodQ = decimate(filtQ, iqDecimFactor);
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

    // Step 3: Final decimation from IF rate to audio rate (~48kHz)
    const effectiveIFRate = sampleRateRef.current / iqDecimFactor;
    const audioDecimFactor = Math.max(1, Math.round(effectiveIFRate / AUDIO_SAMPLE_RATE));
    if (audioDecimFactor > 1) {
      // Stateful audio lowpass: the old stateless lowPassFilter reset sum=0 each call,
      // giving output[0] = input[0]/taps (≈ 1/21 amplitude) instead of a proper average.
      // After audio decimation this surfaced as a single attenuated sample every USB
      // transfer — repeating at ~976 Hz — heard as the "tiss tiss" noise.
      if (!audioLPFRef.current || audioLPFRef.current.taps !== audioDecimFactor) {
        audioLPFRef.current = new StatefulMovingAverage(audioDecimFactor);
      }
      audioSamples = audioLPFRef.current.process(audioSamples);
      audioSamples = decimate(audioSamples, audioDecimFactor);
    }

    // Calculate the ACTUAL audio rate from the samples we produced, not the mathematical ideal.
    // Math.round in decimate() means we produce 49 samples for FM (vs floor=48), so the true
    // rate is audioSamples.length × HackRF_SR / numIQSamples. Using this value in createBuffer()
    // eliminates the 16ms/sec scheduler drift that was causing a ~3s periodic hiss.
    // Example: FM 8MS/s → 49 × 8e6/8192 = 47,852 Hz (vs ideal 47,619 Hz, vs floor=46,875 Hz).
    const effectiveAudioRate = Math.round(audioSamples.length * sampleRateRef.current / numSamples);

    // FM de-emphasis — invert the 75μs pre-emphasis applied by broadcast
    // FM transmitters. Without this, treble is boosted up to ~17 dB at 15 kHz,
    // making FM audio sound very hissy and harsh.
    if (currentMode === 'FM' || currentMode === 'WFM') {
      if (effectiveAudioRate !== lastEffectiveAudioRateRef.current) {
        lastEffectiveAudioRateRef.current = effectiveAudioRate;
        deemphasisFilterRef.current = new DeemphasisFilter(effectiveAudioRate);
      }
      deemphasisFilterRef.current!.process(audioSamples);
    }

    // Diagnostic logging: every 3 seconds, report audio output statistics to help
    // debug FM reception issues (e.g., silent audio, low levels, clipping)
    const nowMs = performance.now();
    if (nowMs - lastDiagnosticLogRef.current >= DIAGNOSTIC_LOG_INTERVAL_MS) {
      lastDiagnosticLogRef.current = nowMs;
      let min = Infinity, max = -Infinity, sumSq = 0;
      for (let i = 0; i < audioSamples.length; i++) {
        const s = audioSamples[i];
        if (s < min) min = s;
        if (s > max) max = s;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / audioSamples.length);
      console.log(
        `[FM DIAG] Mode=${currentMode} | Audio: ${audioSamples.length} samples @ ${effectiveAudioRate} Hz | ` +
        `Range=[${min.toFixed(3)}, ${max.toFixed(3)}] | RMS=${rms.toFixed(4)} | ` +
        `Post-boost peak=${(max * 6).toFixed(2)}`
      );
    }

    if (!mutedRef.current && audioOutputRef.current) {
      audioOutputRef.current.play(audioSamples, effectiveAudioRate);
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
      const port = await (navigator as Navigator & { serial: { requestPort: () => Promise<SerialPort> } }).serial.requestPort();

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
    cleanupResources();
    setState({
      isConnected: false,
      isActive: false,
      serialNumber: undefined,
      firmwareVersion: undefined,
      spectrumData: [],
      signalStrength: -100,
      peakHold: -100,
      connectionType: null,
      centerFrequency: 100e6,
      tunedFrequency: 100e6,
    });
    console.log('HackRF disconnected');
  }, [cleanupResources]);

  // ==================== STREAMING ====================
  const initAudio = async () => {
    const audio = new AudioOutput();
    audio.setOutputDevice(audioDeviceRef.current);
    await audio.init(AUDIO_SAMPLE_RATE);
    audio.setVolume(volumeRef.current);
    if (mutedRef.current) audio.setMuted(true);
    audioOutputRef.current = audio;

    fmDemodRef.current.reset();
    amDemodRef.current.reset();
    iqBufferRef.current.offset = 0;
    deemphasisFilterRef.current = null;
    lastEffectiveAudioRateRef.current = 0;
    dcBlockerRef.current.reset();
    iqLPFIRef.current  = null;
    iqLPFQRef.current  = null;
    audioLPFRef.current = null;
    samplesDiscardedRef.current = 0;  // Reset transient discard counter
  };

  const startStreaming = useCallback(async (): Promise<void> => {
    if (streamingRef.current) return;

    try {
      await initAudio();
      streamingRef.current = true;
      setState(prev => ({ ...prev, isActive: true, peakHold: -100 }));

      if (hackrfRef.current) {
        const dev = hackrfRef.current;
        const tunedFreq = tunedFrequencyRef.current;
        const sr = sampleRateRef.current;
        const bw = bandwidthRef.current;

        // Initialize center frequency to tuned frequency (no offset initially)
        centerFrequencyRef.current = tunedFreq;
        frequencyOffsetRef.current = 0;
        frequencyTranslatorRef.current.setOffset(0, sr);

        console.log(`HackRF: Configuring → center=${(tunedFreq / 1e6).toFixed(3)} MHz, SR=${(sr / 1e6).toFixed(1)} MS/s, BW=${(bw / 1e6).toFixed(2)} MHz`);

        // Step 1: Configure all baseband parameters and gains BEFORE entering RX mode.
        // Per libhackrf, gain commands are accepted in any state — setting them here
        // ensures data starts flowing with the correct gains immediately.
        await dev.setSampleRate(sr);
        await dev.setBasebandFilter(bw);
        await dev.setFrequency(tunedFreq);
        await dev.setAmpEnable(ampEnabledRef.current);
        await dev.setLnaGain(lnaGainRef.current);
        await dev.setVgaGain(vgaGainRef.current);
        console.log(`HackRF: Gains set → LNA=${lnaGainRef.current} dB, VGA=${vgaGainRef.current} dB, Amp=${ampEnabledRef.current ? 'ON' : 'OFF'}`);

        // Step 2: Enter RX mode — data starts flowing immediately after this call
        await dev.startRx((samples: Int8Array) => {
          processIQData(samples);
        });
      } else if (portRef.current) {
        // WebSerial fallback path
        const reader = portRef.current.readable?.getReader();
        if (!reader) {
          throw new Error('Could not get readable stream');
        }
        readerRef.current = reader;

        const readLoop = async () => {
          try {
            while (streamingRef.current) {
              try {
                const { value, done } = await reader.read();
                if (done || !streamingRef.current) break;
                if (value) processIQData(value);
              } catch (error) {
                // AbortError is expected when reader.cancel() is called intentionally
                // (stopStreaming / disconnect). Any other error is unexpected.
                if ((error as Error).name === 'AbortError') break;
                console.error('HackRF serial read error:', error);
                break;
              }
            }
          } finally {
            // If streamingRef is still true here, the loop exited due to an error
            // or a physical disconnect rather than an intentional stop.
            if (streamingRef.current) {
              handleUnexpectedDisconnectRef.current();
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

    // Cancel the WebSerial reader so the read loop exits cleanly and releases
    // the stream lock, allowing port.close() to succeed later if needed.
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;

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
    // Update tuned frequency via DSP translation only (no hardware retuning)
    tunedFrequencyRef.current = freq;
    const offset = freq - centerFrequencyRef.current;
    frequencyOffsetRef.current = offset;
    frequencyTranslatorRef.current.setOffset(offset, sampleRateRef.current);
    setState(prev => ({ ...prev, tunedFrequency: freq }));
    console.log(`Tuned: ${(freq / 1e6).toFixed(6)} MHz (offset: ${(offset / 1e3).toFixed(1)} kHz from center)`);
  }, []);

  const setCenterFrequency = useCallback(async (freq: number): Promise<void> => {
    // Update hardware center frequency
    centerFrequencyRef.current = freq;

    // Recalculate offset for current tuned frequency
    const offset = tunedFrequencyRef.current - freq;
    frequencyOffsetRef.current = offset;
    frequencyTranslatorRef.current.setOffset(offset, sampleRateRef.current);

    if (hackrfRef.current) {
      await hackrfRef.current.setFrequency(freq);
    }

    setState(prev => ({ ...prev, centerFrequency: freq }));
    console.log(`Center: ${(freq / 1e6).toFixed(3)} MHz (hardware retuned)`);
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

  const setAmpEnable = useCallback(async (enabled: boolean): Promise<void> => {
    ampEnabledRef.current = enabled;
    if (hackrfRef.current) {
      await hackrfRef.current.setAmpEnable(enabled);
    }
    console.log('Set RF amp:', enabled ? 'ON' : 'OFF');
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
    return () => { cleanupResources(); };
  }, [cleanupResources]);

  // Expose audioOutput to window for debugging (test tone, diagnostics)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { __hackrfAudioOutput?: unknown }).__hackrfAudioOutput = audioOutputRef.current;
    }
  }, []);

  // Handle disconnection events from external causes:
  //   • beforeunload  — tab/browser close
  //   • navigator.usb 'disconnect'    — HackRF physically unplugged (WebUSB path)
  //   • navigator.serial 'disconnect' — serial port physically removed (WebSerial path)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Mark streaming stopped synchronously. Async teardown (USB control transfers,
      // port.close) is best-effort — browsers do not guarantee promises complete
      // after unload begins, but the OS will release the USB/serial port regardless.
      streamingRef.current = false;
      audioOutputRef.current?.stop();
      hackrfRef.current?.disconnect().catch(() => {});
      readerRef.current?.cancel().catch(() => {});
      portRef.current?.close().catch(() => {});
    };

    // USBConnectionEvent.device holds the disconnected USBDevice
    const handleUsbDisconnect = (event: Event) => {
      const disconnectedDevice = (event as Event & { device?: USBDevice }).device;
      if (disconnectedDevice && hackrfRef.current?.usbDevice === disconnectedDevice) {
        handleUnexpectedDisconnect();
      }
    };

    // SerialConnectionEvent.port holds the disconnected SerialPort
    const handleSerialDisconnect = (event: Event) => {
      const disconnectedPort = (event as Event & { port?: SerialPort }).port;
      if (disconnectedPort && disconnectedPort === portRef.current) {
        handleUnexpectedDisconnect();
      }
    };

    type NavWithUSBSerial = Navigator & {
      usb?: { addEventListener: (t: string, l: EventListener) => void; removeEventListener: (t: string, l: EventListener) => void };
      serial?: { addEventListener: (t: string, l: EventListener) => void; removeEventListener: (t: string, l: EventListener) => void };
    };
    const nav = navigator as NavWithUSBSerial;

    window.addEventListener('beforeunload', handleBeforeUnload);
    nav.usb?.addEventListener('disconnect', handleUsbDisconnect);
    nav.serial?.addEventListener('disconnect', handleSerialDisconnect);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      nav.usb?.removeEventListener('disconnect', handleUsbDisconnect);
      nav.serial?.removeEventListener('disconnect', handleSerialDisconnect);
    };
  }, [handleUnexpectedDisconnect]);

  return {
    ...state,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    setFrequency,
    setCenterFrequency,
    setSampleRate,
    setBasebandFilter,
    setLnaGain,
    setVgaGain,
    setAmpEnable,
    setTxMode,
  };
};
