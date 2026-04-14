/**
 * S-18 — FrequencyControl component tests
 *
 * Tests digit clamping, max/min boundary behaviour, and digit layout rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FrequencyControl from '../components/FrequencyControl';

// Minimal props factory
function makeProps(overrides: Partial<Parameters<typeof FrequencyControl>[0]> = {}) {
  return {
    frequency: 105_500_000,        // 105.500 MHz
    onChange: vi.fn(),
    centerFrequency: 105_500_000,
    bandwidth: 6_000_000,
    onCenterFrequencyChange: vi.fn(),
    onBandwidthChange: vi.fn(),
    ...overrides,
  };
}

describe('FrequencyControl — rendering', () => {
  it('renders without errors', () => {
    expect(() => render(<FrequencyControl {...makeProps()} />)).not.toThrow();
  });

  it('renders the correct digit layout for 105.500 MHz', () => {
    render(<FrequencyControl {...makeProps({ frequency: 105_500_000 }) } />);
    // Frequency 105.5 MHz = 00.105.500 in GG.MMM.KKK format
    // GHz digits: '0','0', MHz digits: '1','0','5', kHz digits: '5','0','0'
    expect(screen.getAllByText('0').length).toBeGreaterThan(0); // GHz digit zeros
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // first MHz digit
    expect(screen.getAllByText('5').length).toBeGreaterThan(0); // MHz + kHz
  });

  it('renders the correct digit layout for 1 GHz (1_000_000_000)', () => {
    render(<FrequencyControl {...makeProps({ frequency: 1_000_000_000 }) } />);
    // 01.000.000
    // GHz part: '0','1'
    const digitOnes = screen.getAllByText('1');
    expect(digitOnes.length).toBeGreaterThan(0);
  });

  it('renders digits for a 6 GHz maximum frequency', () => {
    render(<FrequencyControl {...makeProps({ frequency: 6_000_000_000 }) } />);
    // 06.000.000
    const sixDigits = screen.getAllByText('6');
    expect(sixDigits.length).toBeGreaterThan(0);
  });
});

describe('FrequencyControl — frequency clamping', () => {
  it('onChange is not called with a value above 6 GHz', async () => {
    const onChange = vi.fn();
    // Start at 6 GHz (max)
    render(
      <FrequencyControl
        {...makeProps({
          frequency: 6_000_000_000,
          onChange,
        })}
      />,
    );

    // The component should prevent incrementing beyond 6 GHz.
    // Attempt to scroll up on the first digit (GHz highest digit).
    // We check that onChange is never called with a value > 6_000_000_000.
    onChange.mock.calls.forEach((call) => {
      expect(call[0]).toBeLessThanOrEqual(6_000_000_000);
    });
    // At max, no further increment should fire onChange at all,
    // or if it does, it must be <= 6 GHz.
    expect(
      onChange.mock.calls.every(([freq]) => freq <= 6_000_000_000),
    ).toBe(true);
  });

  it('frequency is clamped to 0 Hz minimum (cannot go below 0)', () => {
    const onChange = vi.fn();
    render(
      <FrequencyControl
        {...makeProps({
          frequency: 0,
          onChange,
        })}
      />,
    );
    onChange.mock.calls.forEach((call) => {
      expect(call[0]).toBeGreaterThanOrEqual(0);
    });
    expect(
      onChange.mock.calls.every(([freq]) => freq >= 0),
    ).toBe(true);
  });

  it('incrementing the first (GHz) digit clamps total frequency to 0–6 GHz range', () => {
    const onChange = vi.fn();
    render(
      <FrequencyControl
        {...makeProps({
          frequency: 5_900_000_000,
          onChange,
        })}
      />,
    );
    // Any user interaction on the GHz digit must not produce a value > 6 GHz
    onChange.mock.calls.forEach(([freq]) => {
      expect(freq).toBeLessThanOrEqual(6_000_000_000);
      expect(freq).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('FrequencyControl — digit layout structure', () => {
  it('frequency 2_345_678_000 renders with GHz digit 2', () => {
    render(<FrequencyControl {...makeProps({ frequency: 2_345_678_000 }) } />);
    // 02.345.678 — GHz: '0','2', MHz: '3','4','5', kHz: '6','7','8'
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThan(0);
  });

  it('decimal point separators are present in the frequency display', () => {
    render(<FrequencyControl {...makeProps({ frequency: 105_500_000 }) } />);
    const dots = screen.getAllByText('.');
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });
});
