/**
 * S-12 — SignalMeter component tests
 *
 * Tests the updated SignalMeter that accepts an optional noiseFloor prop
 * and uses it to compute a more accurate SNR display.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignalMeter from '../components/SignalMeter';

describe('SignalMeter — rendering', () => {
  it('renders without errors', () => {
    expect(() =>
      render(<SignalMeter isActive={false} />),
    ).not.toThrow();
  });

  it('renders a Signal Strength label', () => {
    render(<SignalMeter isActive={false} />);
    expect(screen.getByText('Signal Strength')).toBeDefined();
  });

  it('shows dashes for signal when isActive is false', () => {
    render(<SignalMeter isActive={false} signalStrength={-60} peakHold={-50} />);
    const dashes = screen.getAllByText('---');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe('SignalMeter — SNR with noiseFloor prop', () => {
  it('displays SNR as (peak - noiseFloor) when noiseFloor prop is provided', () => {
    // peak = -50, noiseFloor = -90 => SNR = 40.0 dB
    render(
      <SignalMeter
        isActive
        signalStrength={-70}
        peakHold={-50}
        noiseFloor={-90}
      />,
    );
    expect(screen.getByText('40.0 dB')).toBeDefined();
  });

  it('SNR of 30.0 dB: peak=-60, noiseFloor=-90', () => {
    render(
      <SignalMeter
        isActive
        signalStrength={-70}
        peakHold={-60}
        noiseFloor={-90}
      />,
    );
    expect(screen.getByText('30.0 dB')).toBeDefined();
  });

  it('falls back to (peak - signalStrength) when noiseFloor prop is absent', () => {
    // signalStrength = -70, peakHold = -50 => SNR = 20.0 dB
    render(
      <SignalMeter
        isActive
        signalStrength={-70}
        peakHold={-50}
      />,
    );
    expect(screen.getByText('20.0 dB')).toBeDefined();
  });
});

describe('SignalMeter — SNR colour coding', () => {
  it('SNR >= 15 dB renders with green colour class', () => {
    const { container } = render(
      <SignalMeter
        isActive
        signalStrength={-80}
        peakHold={-60}
        noiseFloor={-95}
      />,
    );
    // SNR = -60 - (-95) = 35 dB — should be green
    const snrEl = container.querySelector('.text-green-400');
    expect(snrEl).not.toBeNull();
  });

  it('SNR >= 5 dB and < 15 dB renders with yellow colour class', () => {
    const { container } = render(
      <SignalMeter
        isActive
        signalStrength={-80}
        peakHold={-70}
        noiseFloor={-80}
      />,
    );
    // SNR = -70 - (-80) = 10 dB — should be yellow
    const snrEl = container.querySelector('.text-yellow-400');
    expect(snrEl).not.toBeNull();
  });

  it('SNR < 5 dB renders with red colour class', () => {
    const { container } = render(
      <SignalMeter
        isActive
        signalStrength={-80}
        peakHold={-78}
        noiseFloor={-80}
      />,
    );
    // SNR = -78 - (-80) = 2 dB — should be red
    const snrEl = container.querySelector('.text-red-400');
    expect(snrEl).not.toBeNull();
  });
});

describe('SignalMeter — peak hold display', () => {
  it('peak displayed value is the raw peakHold, not peak minus average', () => {
    render(
      <SignalMeter
        isActive
        signalStrength={-70}
        peakHold={-55}
        noiseFloor={-90}
      />,
    );
    // The peak display should show -55.0, not (-55 - -70) = 15
    expect(screen.getByText('-55.0 dB')).toBeDefined();
  });
});
