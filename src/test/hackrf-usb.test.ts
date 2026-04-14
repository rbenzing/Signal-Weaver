/**
 * S-04 — HackRFDevice / computeBasebandFilterBw tests
 *
 * Tests that HackRFDevice implements ISDRDevice and that the exported
 * computeBasebandFilterBw function produces correct rounded/clamped values.
 */

import { describe, it, expect } from 'vitest';
import type { ISDRDevice, HackRFDeviceInfo as IFaceInfo } from '../lib/interfaces';
// HackRFDeviceInfo re-exported for backward compat — both imports must work
import { HackRFDevice, computeBasebandFilterBw } from '../lib/hackrf-usb';
import type { HackRFDeviceInfo as USBInfo } from '../lib/hackrf-usb';

// ---------------------------------------------------------------------------
// Re-export compatibility
// ---------------------------------------------------------------------------

describe('HackRFDeviceInfo re-export compatibility', () => {
  it('HackRFDeviceInfo imported from interfaces is structurally identical to the one from hackrf-usb', () => {
    // TypeScript compile-time check: both types should be usable interchangeably.
    const info: IFaceInfo = { boardId: 2, firmwareVersion: 'test', serialNumber: 'SERIAL' };
    const usbInfo: USBInfo = info; // if this compiles, the types are compatible
    expect(usbInfo.boardId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// HackRFDevice structural check
// ---------------------------------------------------------------------------

describe('HackRFDevice', () => {
  it('is assignable to ISDRDevice (structural type check)', () => {
    // TypeScript will error here if HackRFDevice does not implement ISDRDevice
    const device: ISDRDevice = new HackRFDevice();
    expect(device).toBeDefined();
  });

  it('isConnected is false before connect()', () => {
    const device = new HackRFDevice();
    expect(device.isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeBasebandFilterBw
// ---------------------------------------------------------------------------

describe('computeBasebandFilterBw', () => {
  it('returns exact match 1750000 for input 1750000', () => {
    expect(computeBasebandFilterBw(1_750_000)).toBe(1_750_000);
  });

  it('returns 1750000 for input 1000000 (below first valid — returns minimum)', () => {
    expect(computeBasebandFilterBw(1_000_000)).toBe(1_750_000);
  });

  it('returns 1750000 for input 500000 (well below min — clamps to minimum)', () => {
    expect(computeBasebandFilterBw(500_000)).toBe(1_750_000);
  });

  it('returns 2500000 for input 3000000 (rounds down to 2500000)', () => {
    expect(computeBasebandFilterBw(3_000_000)).toBe(2_500_000);
  });

  it('returns 8000000 for input 8500000 (rounds down to nearest valid)', () => {
    expect(computeBasebandFilterBw(8_500_000)).toBe(8_000_000);
  });

  it('returns 1750000 for input 1750000 (exact second check)', () => {
    expect(computeBasebandFilterBw(1_750_000)).toBe(1_750_000);
  });

  it('returns 6000000 for input 6000001 (floor to 6000000)', () => {
    expect(computeBasebandFilterBw(6_000_001)).toBe(6_000_000);
  });

  it('returns 28000000 for input 28000001 (clamped at maximum)', () => {
    expect(computeBasebandFilterBw(28_000_001)).toBe(28_000_000);
  });

  it('returns 28000000 for input 30000000 (well above max — clamps to max)', () => {
    expect(computeBasebandFilterBw(30_000_000)).toBe(28_000_000);
  });

  it('returns exact 28000000 for input 28000000', () => {
    expect(computeBasebandFilterBw(28_000_000)).toBe(28_000_000);
  });
});

// ---------------------------------------------------------------------------
// Gain step rounding formulas (tested directly without USB — white-box)
// ---------------------------------------------------------------------------

describe('LNA gain step rounding (8 dB steps, 0–40 dB)', () => {
  it('32 dB rounds to 32', () => {
    expect(Math.min(40, Math.max(0, Math.round(32 / 8) * 8))).toBe(32);
  });

  it('36 dB rounds to 40 (nearest 8-dB step)', () => {
    expect(Math.min(40, Math.max(0, Math.round(36 / 8) * 8))).toBe(40);
  });

  it('33 dB rounds to 32 (nearest 8-dB step down)', () => {
    expect(Math.min(40, Math.max(0, Math.round(33 / 8) * 8))).toBe(32);
  });

  it('0 dB stays 0', () => {
    expect(Math.min(40, Math.max(0, Math.round(0 / 8) * 8))).toBe(0);
  });

  it('45 dB clamps to 40 (max)', () => {
    expect(Math.min(40, Math.max(0, Math.round(45 / 8) * 8))).toBe(40);
  });
});

describe('VGA gain step rounding (2 dB steps, 0–62 dB)', () => {
  it('33 dB rounds to 34', () => {
    expect(Math.min(62, Math.max(0, Math.round(33 / 2) * 2))).toBe(34);
  });

  it('62 dB stays 62', () => {
    expect(Math.min(62, Math.max(0, Math.round(62 / 2) * 2))).toBe(62);
  });

  it('63 dB clamps to 62 (max)', () => {
    expect(Math.min(62, Math.max(0, Math.round(63 / 2) * 2))).toBe(62);
  });

  it('0 dB stays 0', () => {
    expect(Math.min(62, Math.max(0, Math.round(0 / 2) * 2))).toBe(0);
  });
});
