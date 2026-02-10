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
 * Decimate with averaging low-pass filter
 */
export function decimate(input: Float32Array, factor: number): Float32Array {
  const outLen = Math.floor(input.length / factor);
  const output = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    const start = i * factor;
    const end = Math.min(start + factor, input.length);
    for (let j = start; j < end; j++) {
      sum += input[j];
    }
    output[i] = sum / (end - start);
  }

  return output;
}

/**
 * Simple low-pass FIR filter (moving average)
 */
export function lowPassFilter(input: Float32Array, taps: number): Float32Array {
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
