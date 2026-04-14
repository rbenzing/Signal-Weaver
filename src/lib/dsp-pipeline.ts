/**
 * DSPPipeline — pure class wrapping all DSP state, extracted from useHackRF.
 * No React, no browser APIs.
 */

import type { IDSPPipeline, DSPResult, DemodMode } from './interfaces';
import {
  computeSpectrum,
  FMDemodulator,
  AMDemodulator,
  SSBDemodulator,
  DeemphasisFilter,
  DCBlocker,
  StatefulMovingAverage,
  FrequencyTranslator,
  decimate,
  getIFDecimationFactor,
} from './dsp';

const FFT_SIZE = 1024;
const AUDIO_SAMPLE_RATE = 48000;
const SAMPLES_TO_DISCARD = 100_000;

export class DSPPipeline implements IDSPPipeline {
  private mode: DemodMode;
  private sampleRate: number;
  private offsetHz: number;

  // Demodulators
  private fmDemod = new FMDemodulator();
  private amDemod = new AMDemodulator();
  private usbDemod = new SSBDemodulator(true);
  private lsbDemod = new SSBDemodulator(false);

  // Filters
  private dcBlocker = new DCBlocker();
  private freqTranslator = new FrequencyTranslator();
  private deemphasisFilter: DeemphasisFilter | null = null;
  private lastEffectiveAudioRate = 0;

  // Stateful LPFs
  private iqLPFI: StatefulMovingAverage | null = null;
  private iqLPFQ: StatefulMovingAverage | null = null;
  private audioLPF: StatefulMovingAverage | null = null;

  // FFT accumulation buffer
  private iqBuffer = {
    i: new Float32Array(FFT_SIZE * 2),
    q: new Float32Array(FFT_SIZE * 2),
    offset: 0,
  };

  // Reusable IQ sample buffer
  private iqSampleBuf = { i: new Float32Array(8192), q: new Float32Array(8192) };

  // Startup transient discard
  private samplesDiscarded = 0;

  constructor(mode: DemodMode, sampleRate: number, offsetHz: number) {
    this.mode = mode;
    this.sampleRate = sampleRate;
    this.offsetHz = offsetHz;
    if (offsetHz !== 0) {
      this.freqTranslator.setOffset(offsetHz, sampleRate);
    }
  }

  process(rawIQ: Int8Array): DSPResult {
    const numSamples = Math.floor(rawIQ.length / 2);

    // Startup discard window
    const inWarmUp = this.samplesDiscarded < SAMPLES_TO_DISCARD;
    if (inWarmUp) {
      this.samplesDiscarded += numSamples;
    }

    // Convert Int8 IQ → Float32
    if (this.iqSampleBuf.i.length < numSamples) {
      this.iqSampleBuf.i = new Float32Array(numSamples);
      this.iqSampleBuf.q = new Float32Array(numSamples);
    }
    const iSamples = this.iqSampleBuf.i.subarray(0, numSamples);
    const qSamples = this.iqSampleBuf.q.subarray(0, numSamples);

    for (let i = 0; i < numSamples; i++) {
      iSamples[i] = rawIQ[i * 2] / 128.0;
      qSamples[i] = rawIQ[i * 2 + 1] / 128.0;
    }

    // DC blocker
    this.dcBlocker.process(iSamples, qSamples);

    // Frequency translation
    this.freqTranslator.translate(iSamples, qSamples);

    // --- FFT for spectrum display ---
    const buf = this.iqBuffer;
    const copyLen = Math.min(numSamples, buf.i.length - buf.offset);
    buf.i.set(iSamples.subarray(0, copyLen), buf.offset);
    buf.q.set(qSamples.subarray(0, copyLen), buf.offset);
    buf.offset += copyLen;

    let spectrumData: Float32Array;
    let signalStrength = -100;
    let peak = -100;
    let noiseFloor = -100;

    if (buf.offset >= FFT_SIZE) {
      spectrumData = computeSpectrum(
        buf.i.subarray(0, FFT_SIZE),
        buf.q.subarray(0, FFT_SIZE),
        FFT_SIZE,
      );
      buf.offset = 0;

      // Compute signal stats
      let sum = 0;
      peak = -200;
      for (let i = 0; i < spectrumData.length; i++) {
        const v = spectrumData[i];
        sum += v;
        if (v > peak) peak = v;
      }
      signalStrength = Math.max(-120, sum / spectrumData.length);

      // Noise floor: median of lowest 25% of FFT bins
      const sorted = Float32Array.from(spectrumData).sort();
      const quarterLen = Math.floor(sorted.length / 4);
      const midIdx = Math.floor(quarterLen / 2);
      noiseFloor = sorted[midIdx];
    } else {
      // Not enough data for FFT yet — return zero spectrum
      spectrumData = new Float32Array(FFT_SIZE);
      spectrumData.fill(-120);
      noiseFloor = -120;
      signalStrength = -120;
      peak = -120;
    }

    // During warm-up, skip audio production
    if (inWarmUp) {
      return {
        spectrumData,
        audioSamples: new Float32Array(0),
        audioSampleRate: AUDIO_SAMPLE_RATE,
        signalStrength,
        peak,
        noiseFloor,
      };
    }

    // --- Demodulation ---
    const iqDecimFactor = getIFDecimationFactor(this.sampleRate, this.mode);
    let demodI: Float32Array = iSamples;
    let demodQ: Float32Array = qSamples;

    if (iqDecimFactor > 1) {
      const iqTaps = Math.min(iqDecimFactor, 64);
      if (!this.iqLPFI || this.iqLPFI.taps !== iqTaps) {
        this.iqLPFI = new StatefulMovingAverage(iqTaps);
        this.iqLPFQ = new StatefulMovingAverage(iqTaps);
      }
      const filtI = this.iqLPFI.process(iSamples);
      const filtQ = this.iqLPFQ!.process(qSamples);
      demodI = decimate(filtI, iqDecimFactor);
      demodQ = decimate(filtQ, iqDecimFactor);
    }

    let audioSamples: Float32Array;
    switch (this.mode) {
      case 'FM': case 'WFM':
        audioSamples = this.fmDemod.demodulate(demodI, demodQ); break;
      case 'AM':
        audioSamples = this.amDemod.demodulate(demodI, demodQ); break;
      case 'USB': case 'CW':
        audioSamples = this.usbDemod.demodulate(demodI, demodQ); break;
      case 'LSB':
        audioSamples = this.lsbDemod.demodulate(demodI, demodQ); break;
      case 'RAW':
        audioSamples = new Float32Array(demodI); break;
      default:
        audioSamples = this.fmDemod.demodulate(demodI, demodQ);
    }

    // Final decimation to audio rate
    const effectiveIFRate = this.sampleRate / iqDecimFactor;
    const audioDecimFactor = Math.max(1, Math.round(effectiveIFRate / AUDIO_SAMPLE_RATE));
    if (audioDecimFactor > 1) {
      if (!this.audioLPF || this.audioLPF.taps !== audioDecimFactor) {
        this.audioLPF = new StatefulMovingAverage(audioDecimFactor);
      }
      audioSamples = this.audioLPF.process(audioSamples);
      audioSamples = decimate(audioSamples, audioDecimFactor);
    }

    // Calculate actual audio rate
    const audioSampleRate = Math.round(
      (audioSamples.length * this.sampleRate) / numSamples,
    );

    // FM de-emphasis
    if (this.mode === 'FM' || this.mode === 'WFM') {
      if (audioSampleRate !== this.lastEffectiveAudioRate) {
        this.lastEffectiveAudioRate = audioSampleRate;
        this.deemphasisFilter = new DeemphasisFilter(audioSampleRate);
      }
      this.deemphasisFilter!.process(audioSamples);
    }

    return {
      spectrumData,
      audioSamples,
      audioSampleRate: audioSampleRate || AUDIO_SAMPLE_RATE,
      signalStrength,
      peak,
      noiseFloor,
    };
  }

  setMode(mode: DemodMode): void {
    this.mode = mode;
    // Reset demodulator state when switching modes
    this.fmDemod.reset();
    this.amDemod.reset();
    this.deemphasisFilter = null;
    this.lastEffectiveAudioRate = 0;
    this.iqLPFI = null;
    this.iqLPFQ = null;
    this.audioLPF = null;
  }

  setSampleRate(hz: number): void {
    this.sampleRate = hz;
    this.iqLPFI = null;
    this.iqLPFQ = null;
    this.audioLPF = null;
    this.deemphasisFilter = null;
    this.lastEffectiveAudioRate = 0;
    if (this.offsetHz !== 0) {
      this.freqTranslator.setOffset(this.offsetHz, hz);
    }
  }

  setOffset(hz: number): void {
    this.offsetHz = hz;
    this.freqTranslator.setOffset(hz, this.sampleRate);
  }

  reset(): void {
    this.samplesDiscarded = 0;
    this.fmDemod.reset();
    this.amDemod.reset();
    this.dcBlocker.reset();
    this.freqTranslator.reset();
    this.deemphasisFilter = null;
    this.lastEffectiveAudioRate = 0;
    this.iqLPFI = null;
    this.iqLPFQ = null;
    this.audioLPF = null;
    this.iqBuffer.offset = 0;
  }
}
