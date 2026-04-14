/**
 * DSP Module - FFT computation and signal demodulation
 */

/**
 * Radix-2 Cooley-Tukey FFT (in-place)
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += size) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < halfSize; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;
        const tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
        const tIm = curRe * im[oddIdx] + curIm * re[oddIdx];

        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;

        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

/**
 * Compute power spectrum in dB from I/Q samples
 */
export function computeSpectrum(iSamples: Float32Array, qSamples: Float32Array, fftSize: number): Float32Array {
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let i = 0; i < fftSize; i++) {
    const w = 0.35875
      - 0.48829 * Math.cos((2 * Math.PI * i) / (fftSize - 1))
      + 0.14128 * Math.cos((4 * Math.PI * i) / (fftSize - 1))
      - 0.01168 * Math.cos((6 * Math.PI * i) / (fftSize - 1));
    re[i] = (iSamples[i] || 0) * w;
    im[i] = (qSamples[i] || 0) * w;
  }

  fft(re, im);

  const spectrum = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const shifted = (i + fftSize / 2) % fftSize;
    const mag = re[shifted] * re[shifted] + im[shifted] * im[shifted];
    spectrum[i] = 10 * Math.log10(mag / (fftSize * fftSize) + 1e-20);
  }

  return spectrum;
}

/**
 * FM demodulator using atan2 phase discriminator
 */
export class FMDemodulator {
  private prevI = 0;
  private prevQ = 0;

  reset(): void {
    this.prevI = 0;
    this.prevQ = 0;
  }

  demodulate(iSamples: Float32Array, qSamples: Float32Array): Float32Array {
    const n = iSamples.length;
    const audio = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const curI = iSamples[i];
      const curQ = qSamples[i];
      // Conjugate multiply: current * conj(previous)
      const realProd = curI * this.prevI + curQ * this.prevQ;
      const imagProd = curQ * this.prevI - curI * this.prevQ;
      audio[i] = Math.atan2(imagProd, realProd) / Math.PI;
      this.prevI = curI;
      this.prevQ = curQ;
    }

    return audio;
  }
}

/**
 * AM demodulator using envelope detection
 */
export class AMDemodulator {
  private dcAvg = 0;

  reset(): void {
    this.dcAvg = 0;
  }

  demodulate(iSamples: Float32Array, qSamples: Float32Array): Float32Array {
    const n = iSamples.length;
    const audio = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const magnitude = Math.sqrt(iSamples[i] * iSamples[i] + qSamples[i] * qSamples[i]);
      this.dcAvg = 0.999 * this.dcAvg + 0.001 * magnitude;
      audio[i] = (magnitude - this.dcAvg) * 2;
    }

    return audio;
  }
}

/**
 * SSB demodulator (USB/LSB)
 */
export class SSBDemodulator {
  private isUpperSideband: boolean;

  constructor(upper: boolean) {
    this.isUpperSideband = upper;
  }

  demodulate(iSamples: Float32Array, qSamples: Float32Array): Float32Array {
    const n = iSamples.length;
    const audio = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      audio[i] = this.isUpperSideband
        ? (iSamples[i] + qSamples[i]) * 0.7
        : (iSamples[i] - qSamples[i]) * 0.7;
    }

    return audio;
  }
}

/**
 * Simple subsampling decimation (take every Nth sample).
 * Should be preceded by a low-pass filter to prevent aliasing.
 */
export function decimate(input: Float32Array, factor: number): Float32Array {
  // Math.round instead of Math.floor: avoids discarding the fractional last group,
  // which causes the audio production rate to be systematically ~1.56% too low for
  // FM at 8 MS/s (1024 IF samples / factor 21 = 48.76 → floor=48, round=49).
  // The rounded-up sample at index (outLen-1)*factor is always within bounds because
  // Math.round(n/f)-1 < n/f, so (Math.round(n/f)-1)*f < n.
  const outLen = Math.round(input.length / factor);
  const output = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    output[i] = input[i * factor];
  }
  return output;
}

/**
 * Low-pass FIR filter (moving average with configurable taps)
 */
export function lowPassFilter(input: Float32Array, taps: number): Float32Array {
  if (taps <= 1) return input;
  const output = new Float32Array(input.length);
  const invTaps = 1 / taps;

  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input[i];
    if (i >= taps) {
      sum -= input[i - taps];
    }
    output[i] = sum * invTaps;
  }

  return output;
}

/**
 * Decimate complex I/Q data by an exact integer factor.
 * Uses a single-stage approach: low-pass filter then subsample.
 * The filter has enough taps to adequately suppress aliasing.
 */
export function decimateIQ(
  iSamples: Float32Array,
  qSamples: Float32Array,
  factor: number
): { i: Float32Array; q: Float32Array } {
  if (factor <= 1) return { i: new Float32Array(iSamples), q: new Float32Array(qSamples) };

  // CRITICAL: taps must NOT exceed the decimation factor, otherwise the moving average
  // filter's -3dB point drops below the signal bandwidth and destroys the content.
  // With taps = factor, -3dB ≈ 0.443 × fs/factor, which equals 0.443 × output_rate.
  // For FM at 8MS/s→1MHz (factor=8): -3dB at 443kHz, preserving ±100kHz FM signal.
  const taps = Math.min(factor, 64);
  const filtI = lowPassFilter(iSamples, taps);
  const filtQ = lowPassFilter(qSamples, taps);

  // Subsample by exact factor
  const outLen = Math.floor(iSamples.length / factor);
  const outI = new Float32Array(outLen);
  const outQ = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    outI[i] = filtI[i * factor];
    outQ[i] = filtQ[i * factor];
  }

  return { i: outI, q: outQ };
}

/**
 * FM de-emphasis filter (IIR low-pass, first order)
 * Broadcast FM pre-emphasizes audio with a 75μs time constant (US/Japan)
 * to reduce high-frequency noise. This filter inverts that, restoring flat response.
 * Transfer function: H(z) = (1-α) / (1 - α·z⁻¹), α = exp(-1/(fs·τ))
 */
export class DeemphasisFilter {
  private alpha: number;
  private prevOutput = 0;

  constructor(sampleRate: number, timeConstantSec = 75e-6) {
    this.alpha = Math.exp(-1 / (sampleRate * timeConstantSec));
  }

  reset(): void {
    this.prevOutput = 0;
  }

  /** Apply de-emphasis in-place */
  process(samples: Float32Array): void {
    const alpha = this.alpha;
    let prev = this.prevOutput;
    for (let i = 0; i < samples.length; i++) {
      prev = (1 - alpha) * samples[i] + alpha * prev;
      samples[i] = prev;
    }
    this.prevOutput = prev;
  }
}

/**
 * DC blocking filter for raw I/Q samples.
 *
 * HackRF (like all direct-conversion SDRs) has a DC offset component at exactly
 * the tuned frequency caused by LO leakage. This appears as a large spike at 0 Hz
 * in the baseband. If uncorrected, it swamps the FM discriminator when the signal
 * carrier is near the centre of the band, making FM demodulation produce pure noise.
 *
 * This IIR estimator tracks and subtracts the slowly-varying DC component separately
 * on I and Q. α = 0.9999 → time constant ≈ 1/((1-α) × fs) = 10 000 samples.
 * At 8 MS/s that is ~1.25 ms — fast enough to follow HackRF drift, slow enough
 * not to attenuate any audio content (lowest FM audio ≈ 300 Hz).
 */
export class DCBlocker {
  private avgI = 0;
  private avgQ = 0;

  reset(): void {
    this.avgI = 0;
    this.avgQ = 0;
  }

  /** Remove DC offset from I/Q samples in-place. */
  process(iSamples: Float32Array, qSamples: Float32Array): void {
    const alpha = 0.9999;
    const beta  = 1 - alpha;
    let ai = this.avgI, aq = this.avgQ;
    for (let i = 0; i < iSamples.length; i++) {
      ai = alpha * ai + beta * iSamples[i];
      iSamples[i] -= ai;
      aq = alpha * aq + beta * qSamples[i];
      qSamples[i] -= aq;
    }
    this.avgI = ai;
    this.avgQ = aq;
  }
}

/**
 * Stateful moving-average low-pass filter.
 *
 * The stateless `lowPassFilter` function resets its accumulator to 0 on every
 * call, which creates a transient ramp-up over the first `taps` output samples.
 * After audio decimation this manifests as a single attenuated sample (≈ 1/taps
 * amplitude) at the start of every USB transfer batch — repeating at ~976 Hz
 * and audible as a "tiss tiss" buzz.
 *
 * This class carries the tail of the previous block as history so the filter
 * response is perfectly continuous across call boundaries.
 */
export class StatefulMovingAverage {
  readonly taps: number;
  private history: Float32Array; // last (taps-1) input samples from previous call

  constructor(taps: number) {
    this.taps = taps;
    this.history = new Float32Array(Math.max(0, taps - 1));
  }

  reset(): void {
    this.history.fill(0);
  }

  process(input: Float32Array): Float32Array {
    if (this.taps <= 1) return new Float32Array(input);

    const h      = this.history;
    const hLen   = h.length;          // = taps - 1
    const invT   = 1 / this.taps;
    const output = new Float32Array(input.length);

    // Pre-load running sum with the saved history.
    let sum = 0;
    for (let k = 0; k < hLen; k++) sum += h[k];

    for (let i = 0; i < input.length; i++) {
      sum += input[i];
      if (i > 0) {
        // Remove the sample leaving the window.
        if (i <= hLen) {
          sum -= h[i - 1];          // still reaching into history
        } else {
          sum -= input[i - hLen - 1]; // entirely within current block
        }
      }
      output[i] = sum * invT;
    }

    // Save the last (taps-1) input samples for the next call.
    if (input.length >= hLen) {
      h.set(input.subarray(input.length - hLen));
    } else {
      h.copyWithin(0, input.length);
      h.set(input, hLen - input.length);
    }

    return output;
  }
}

/**
 * Frequency translation (shift I/Q signal in frequency domain).
 * Translates I/Q samples by frequencyOffset Hz.
 *
 * This allows us to keep the hardware tuned to a fixed center frequency
 * while digitally tuning to any frequency within the captured bandwidth.
 *
 * The translation is performed by complex multiplication with e^(j*2π*f_offset*n/fs):
 * I_out[n] = I[n] * cos(phase) - Q[n] * sin(phase)
 * Q_out[n] = I[n] * sin(phase) + Q[n] * cos(phase)
 * where phase = 2π * frequencyOffset * n / sampleRate
 */
export class FrequencyTranslator {
  private phase = 0; // Accumulated phase (radians)
  private phaseIncrement = 0; // Phase increment per sample (radians)

  /**
   * Set the frequency offset to translate.
   * @param frequencyOffset Offset in Hz (positive = shift up, negative = shift down)
   * @param sampleRate Sample rate in Hz
   */
  setOffset(frequencyOffset: number, sampleRate: number): void {
    // Phase increment per sample
    this.phaseIncrement = (2 * Math.PI * frequencyOffset) / sampleRate;
    this.phase = 0; // Reset phase accumulator
  }

  reset(): void {
    this.phase = 0;
  }

  /**
   * Translate I/Q samples by the configured frequency offset.
   * Modifies samples in-place for performance.
   */
  translate(iSamples: Float32Array, qSamples: Float32Array): void {
    if (this.phaseIncrement === 0) return; // No translation needed

    let phase = this.phase;
    const increment = this.phaseIncrement;

    for (let i = 0; i < iSamples.length; i++) {
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);

      const iOrig = iSamples[i];
      const qOrig = qSamples[i];

      // Complex multiplication: (I + jQ) * e^(j*phase)
      iSamples[i] = iOrig * cosPhase - qOrig * sinPhase;
      qSamples[i] = iOrig * sinPhase + qOrig * cosPhase;

      phase += increment;
    }

    // Wrap phase to avoid numerical issues with large values
    // Keep phase in range [-π, π]
    this.phase = ((phase + Math.PI) % (2 * Math.PI)) - Math.PI;
  }
}

/**
 * Get I/Q decimation factor for a given mode and sample rate.
 * Returns the factor to reduce I/Q rate to an appropriate IF before demodulation.
 */
export function getIFDecimationFactor(sampleRate: number, mode: string): number {
  let targetIFRate: number;
  switch (mode) {
    case 'WFM':
      // Broadcast FM: ±75kHz deviation + stereo/RDS = ~200kHz signal bandwidth
      // Need IF rate >> 200kHz to preserve modulation for demodulator
      targetIFRate = 1000000;
      break;
    case 'FM':
      // Also used for broadcast FM — need high IF to preserve ±75kHz modulation
      targetIFRate = 1000000;
      break;
    case 'AM':
      // AM broadcast: ±5kHz bandwidth, 200kHz IF is plenty
      targetIFRate = 200000;
      break;
    case 'USB': case 'LSB': case 'CW':
      // SSB/CW: ~3kHz bandwidth
      targetIFRate = 48000;
      break;
    default:
      targetIFRate = 1000000;
  }

  return Math.max(1, Math.floor(sampleRate / targetIFRate));
}