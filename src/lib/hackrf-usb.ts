/**
 * HackRF One WebUSB Protocol Layer
 * Implements actual HackRF vendor USB control transfers and bulk data streaming.
 */

const HACKRF_VENDOR_ID = 0x1d50;
const HACKRF_PRODUCT_IDS = [0x6089, 0x604b];

/**
 * Valid MAX2837 baseband filter bandwidths (in Hz).
 * The HackRF firmware only accepts these exact values.
 */
const VALID_BASEBAND_BW = [
  1750000, 2500000, 3500000, 5000000, 5500000,
  6000000, 7000000, 8000000, 9000000, 10000000,
  12000000, 14000000, 15000000, 20000000, 24000000, 28000000,
];

/** Round a requested bandwidth down to the nearest valid MAX2837 baseband filter value */
function computeBasebandFilterBw(requestedHz: number): number {
  let best = VALID_BASEBAND_BW[0];
  for (const bw of VALID_BASEBAND_BW) {
    if (bw <= requestedHz) best = bw;
    else break;
  }
  return best;
}

enum HackRFRequest {
  SET_TRANSCEIVER_MODE = 1,
  SAMPLE_RATE_SET = 6,
  BASEBAND_FILTER_BANDWIDTH_SET = 7,
  BOARD_ID_READ = 14,
  VERSION_STRING_READ = 15,
  SET_FREQ = 16,
  AMP_ENABLE = 17,
  BOARD_PARTID_SERIALNO_READ = 18,
  SET_LNA_GAIN = 19,
  SET_VGA_GAIN = 20,
  SET_TXVGA_GAIN = 21,
}

enum TransceiverMode {
  OFF = 0,
  RX = 1,
  TX = 2,
}

export interface HackRFDeviceInfo {
  boardId: number;
  firmwareVersion: string;
  serialNumber: string;
}

// Use any for WebUSB types since the browser API may not have TS declarations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUSBDevice = any;

export class HackRFDevice {
  private device: AnyUSBDevice = null;
  private bulkInEndpoint = 0;
  private streaming = false;
  private onData: ((samples: Int8Array) => void) | null = null;
  private interfaceNumber = 0;

  get isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  async connect(): Promise<HackRFDeviceInfo> {
    const nav = navigator as any;
    if (!nav.usb) {
      throw new Error(
        'WebUSB API not supported. Please use Chrome or Edge.\n\n' +
        'If your HackRF shows as a COM port, install the WinUSB driver using Zadig:\n' +
        '1. Download Zadig from https://zadig.akeo.ie/\n' +
        '2. Options → List All Devices\n' +
        '3. Select your HackRF One\n' +
        '4. Replace driver with WinUSB'
      );
    }

    try {
      this.device = await nav.usb.requestDevice({
        filters: HACKRF_PRODUCT_IDS.map(pid => ({
          vendorId: HACKRF_VENDOR_ID,
          productId: pid,
        })),
      });
    } catch (error) {
      if ((error as Error).name === 'SecurityError') {
        const url = window.location.href;
        window.open(url, '_blank');
        throw new Error('WebUSB is blocked in iframes. Opening in a new tab...');
      }
      if ((error as Error).name === 'NotFoundError') {
        throw new Error(
          'No HackRF device found.\n\n' +
          'Make sure:\n' +
          '1. HackRF is plugged in and in HackRF mode\n' +
          '2. WinUSB driver is installed (use Zadig)\n' +
          '3. No other software (SDR#, GNU Radio) is using the device'
        );
      }
      throw error;
    }

    if (!this.device) throw new Error('No device selected.');

    await this.device.open();

    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    const iface = this.device.configuration.interfaces[0];
    this.interfaceNumber = iface.interfaceNumber;
    await this.device.claimInterface(this.interfaceNumber);

    // Find bulk IN endpoint
    const alternate = iface.alternates[0];
    for (const ep of alternate.endpoints) {
      if (ep.type === 'bulk' && ep.direction === 'in') {
        this.bulkInEndpoint = ep.endpointNumber;
        break;
      }
    }

    if (!this.bulkInEndpoint) {
      this.bulkInEndpoint = 1;
      console.warn('No bulk IN endpoint found, defaulting to endpoint 1');
    }

    const info = await this.readDeviceInfo();
    console.log('HackRF connected via WebUSB:', info);
    return info;
  }

  async disconnect(): Promise<void> {
    await this.stopStreaming();
    if (this.device) {
      try { await this.device.releaseInterface(this.interfaceNumber); } catch { /* ignore */ }
      try { await this.device.close(); } catch { /* ignore */ }
      this.device = null;
    }
  }

  private async controlIn(request: number, value: number, length: number, index = 0): Promise<DataView> {
    if (!this.device) throw new Error('Not connected');
    const result = await this.device.controlTransferIn(
      { requestType: 'vendor', recipient: 'device', request, value, index },
      length
    );
    if (result.status !== 'ok' || !result.data) {
      throw new Error(`Control IN failed: request=${request} status=${result.status}`);
    }
    return result.data;
  }

  private async controlOut(request: number, value: number, data?: BufferSource): Promise<void> {
    if (!this.device) throw new Error('Not connected');
    const result = await this.device.controlTransferOut(
      { requestType: 'vendor', recipient: 'device', request, value, index: 0 },
      data
    );
    if (result.status !== 'ok') {
      throw new Error(`Control OUT failed: request=${request} status=${result.status}`);
    }
  }

  private async readDeviceInfo(): Promise<HackRFDeviceInfo> {
    let boardId = 0;
    try {
      const d = await this.controlIn(HackRFRequest.BOARD_ID_READ, 0, 1);
      boardId = d.getUint8(0);
    } catch { /* ignore */ }

    let firmwareVersion = 'Unknown';
    try {
      const d = await this.controlIn(HackRFRequest.VERSION_STRING_READ, 0, 255);
      firmwareVersion = new TextDecoder().decode(d.buffer).replace(/\0+$/, '');
    } catch { /* ignore */ }

    let serialNumber = 'Unknown';
    try {
      const d = await this.controlIn(HackRFRequest.BOARD_PARTID_SERIALNO_READ, 0, 24);
      const parts: string[] = [];
      for (let i = 8; i < 24; i += 4) {
        parts.push(d.getUint32(i, true).toString(16).padStart(8, '0'));
      }
      serialNumber = parts.join('').toUpperCase();
    } catch { /* ignore */ }

    return { boardId, firmwareVersion, serialNumber };
  }

  async setFrequency(freqHz: number): Promise<void> {
    const data = new ArrayBuffer(8);
    const view = new DataView(data);
    view.setUint32(0, Math.floor(freqHz / 1e6), true);
    view.setUint32(4, Math.floor(freqHz % 1e6), true);
    await this.controlOut(HackRFRequest.SET_FREQ, 0, data);
    console.log(`HackRF: freq → ${(freqHz / 1e6).toFixed(3)} MHz`);
  }

  async setSampleRate(rateHz: number): Promise<void> {
    const data = new ArrayBuffer(8);
    const view = new DataView(data);
    view.setUint32(0, Math.floor(rateHz), true);
    view.setUint32(4, 1, true);
    await this.controlOut(HackRFRequest.SAMPLE_RATE_SET, 0, data);
    console.log(`HackRF: sample rate → ${(rateHz / 1e6).toFixed(1)} MS/s`);
  }

  async setBasebandFilter(bwHz: number): Promise<void> {
    // MAX2837 only supports specific baseband filter bandwidths.
    // Round to nearest valid value to avoid silent failures.
    const bw = computeBasebandFilterBw(Math.floor(bwHz));
    if (!this.device) throw new Error('Not connected');
    // HackRF protocol: value = low 16 bits, index = high 16 bits, no data payload
    const result = await this.device.controlTransferOut(
      {
        requestType: 'vendor',
        recipient: 'device',
        request: HackRFRequest.BASEBAND_FILTER_BANDWIDTH_SET,
        value: bw & 0xffff,
        index: (bw >> 16) & 0xffff,
      }
    );
    if (result.status !== 'ok') {
      throw new Error(`setBasebandFilter failed: ${result.status}`);
    }
    console.log(`HackRF: baseband filter → ${(bw / 1e6).toFixed(2)} MHz (requested ${(bwHz / 1e6).toFixed(2)} MHz)`);
  }

  async setLnaGain(gain: number): Promise<void> {
    // Per libhackrf: LNA gain 0-40 dB in 8 dB steps, value in INDEX field
    const rounded = Math.min(40, Math.max(0, gain)) & ~0x07;
    const result = await this.controlIn(HackRFRequest.SET_LNA_GAIN, 0, 1, rounded);
    const success = result.getUint8(0);
    console.log(`HackRF: LNA gain → ${rounded} dB (success=${success})`);
  }

  async setVgaGain(gain: number): Promise<void> {
    // Per libhackrf: VGA gain 0-62 dB in 2 dB steps, value in INDEX field
    const rounded = Math.min(62, Math.max(0, gain)) & ~0x01;
    const result = await this.controlIn(HackRFRequest.SET_VGA_GAIN, 0, 1, rounded);
    const success = result.getUint8(0);
    console.log(`HackRF: VGA gain → ${rounded} dB (success=${success})`);
  }

  async setTxVgaGain(gain: number): Promise<void> {
    // Per libhackrf: TX VGA gain 0-47 dB, value in INDEX field
    const clamped = Math.min(47, Math.max(0, gain));
    const result = await this.controlIn(HackRFRequest.SET_TXVGA_GAIN, 0, 1, clamped);
    const success = result.getUint8(0);
    console.log(`HackRF: TX VGA gain → ${clamped} dB (success=${success})`);
  }

  async setAmpEnable(enabled: boolean): Promise<void> {
    await this.controlOut(HackRFRequest.AMP_ENABLE, enabled ? 1 : 0);
  }

  private async setTransceiverMode(mode: TransceiverMode): Promise<void> {
    await this.controlOut(HackRFRequest.SET_TRANSCEIVER_MODE, mode);
    console.log(`HackRF: mode → ${TransceiverMode[mode]}`);
  }

  async startRx(onData: (samples: Int8Array) => void): Promise<void> {
    this.onData = onData;
    this.streaming = true;
    await this.setTransceiverMode(TransceiverMode.RX);
    this.readLoop();
  }

  async startTx(): Promise<void> {
    this.streaming = true;
    await this.setTransceiverMode(TransceiverMode.TX);
  }

  async stopStreaming(): Promise<void> {
    this.streaming = false;
    try { await this.setTransceiverMode(TransceiverMode.OFF); } catch { /* */ }
  }

  private async readLoop(): Promise<void> {
    while (this.streaming && this.device?.opened) {
      try {
        const result = await this.device.transferIn(this.bulkInEndpoint, 16384);
        if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
          // CRITICAL: Use byteOffset/byteLength from DataView — the underlying
          // ArrayBuffer may be larger than the valid transfer data.
          const dv = result.data;
          this.onData?.(new Int8Array(dv.buffer, dv.byteOffset, dv.byteLength));
        } else if (result.status === 'stall') {
          await this.device.clearHalt('in', this.bulkInEndpoint);
        }
      } catch (error) {
        if (this.streaming) console.error('HackRF bulk read error:', error);
        break;
      }
    }
  }
}
