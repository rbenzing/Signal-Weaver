import { useState, useCallback, useRef, useEffect } from 'react';

interface HackRFState {
  isConnected: boolean;
  isActive: boolean;
  serialNumber: string | undefined;
  firmwareVersion: string | undefined;
  spectrumData: number[];
  signalStrength: number;
  peakHold: number;
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

export const useHackRF = (): UseHackRFReturn => {
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

  const connect = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serial' in navigator)) {
        console.error('WebSerial API not supported in this browser');
        alert('WebSerial is not supported in this browser. Please use Chrome or Edge.');
        return false;
      }

      // Request port access - this will show the browser's device picker
      const port = await (navigator as any).serial.requestPort({
        filters: [
          { usbVendorId: 0x1d50, usbProductId: 0x6089 }, // HackRF One
          { usbVendorId: 0x1d50, usbProductId: 0x604b }, // HackRF Jawbreaker
        ]
      });

      await port.open({ baudRate: 115200 });
      portRef.current = port;

      // Get device info
      const info = port.getInfo();
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        serialNumber: info.usbProductId?.toString(16).toUpperCase() || 'Unknown',
        firmwareVersion: 'v2023.01.1', // Would be read from device
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

  const startStreaming = useCallback(async (): Promise<void> => {
    if (!portRef.current || streamingRef.current) return;

    try {
      streamingRef.current = true;
      setState(prev => ({ ...prev, isActive: true }));

      const reader = portRef.current.readable?.getReader();
      if (!reader) return;
      readerRef.current = reader;

      // Read loop for spectrum data
      const readLoop = async () => {
        const fftSize = 1024;
        const buffer = new Float32Array(fftSize);
        
        while (streamingRef.current && portRef.current) {
          try {
            const { value, done } = await reader.read();
            if (done || !streamingRef.current) break;

            if (value) {
              // Convert raw bytes to spectrum data
              // Real implementation would process I/Q samples and compute FFT
              const samples = new Int8Array(value.buffer);
              for (let i = 0; i < Math.min(samples.length, fftSize); i++) {
                // Convert to dB scale (simplified)
                buffer[i] = (samples[i] / 128) * 60 - 80;
              }

              // Calculate signal strength from data
              const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
              const peak = Math.max(...Array.from(buffer));

              setState(prev => ({
                ...prev,
                spectrumData: Array.from(buffer),
                signalStrength: avg,
                peakHold: Math.max(prev.peakHold, peak),
              }));
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
  }, []);

  const stopStreaming = useCallback((): void => {
    streamingRef.current = false;
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
    // HackRF command format for frequency (simplified)
    const cmd = new Uint8Array([0x01, ...new Uint8Array(new BigUint64Array([BigInt(freq)]).buffer)]);
    await sendCommand(cmd);
    console.log('Set frequency:', freq);
  }, []);

  const setSampleRate = useCallback(async (rate: number): Promise<void> => {
    const cmd = new Uint8Array([0x02, ...new Uint8Array(new Uint32Array([rate]).buffer)]);
    await sendCommand(cmd);
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
