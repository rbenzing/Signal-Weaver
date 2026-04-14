import { useState, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FrequencyControlProps {
  frequency: number;
  onChange: (freq: number) => void;
  centerFrequency: number;
  bandwidth: number;
  onCenterFrequencyChange: (freq: number) => void;
  onBandwidthChange: (bw: number) => void;
}

// Multipliers for frequency digits (GG.MMM.KKK format)
const freqMultipliers = [
  1e9,   // index 0: 1 GHz
  1e8,   // index 1: 100 MHz
  0,     // index 2: decimal point
  1e8,   // index 3: 100 MHz
  1e7,   // index 4: 10 MHz
  1e6,   // index 5: 1 MHz
  0,     // index 6: decimal point
  1e5,   // index 7: 100 kHz
  1e4,   // index 8: 10 kHz
  1e3,   // index 9: 1 kHz
];

// Multipliers for bandwidth digits (MMM.KKK format)
const bwMultipliers = [
  1e8,   // index 0: 100 MHz
  1e7,   // index 1: 10 MHz
  1e6,   // index 2: 1 MHz
  0,     // index 3: decimal point
  1e5,   // index 4: 100 kHz
  1e4,   // index 5: 10 kHz
  1e3,   // index 6: 1 kHz
];

const FrequencyControl = ({
  frequency,
  onChange,
  centerFrequency,
  bandwidth,
  onCenterFrequencyChange,
  onBandwidthChange
}: FrequencyControlProps) => {
  const [activeDigit, setActiveDigit] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frequencyRef = useRef(frequency);
  const centerFrequencyRef = useRef(centerFrequency);
  const bandwidthRef = useRef(bandwidth);

  // Keep refs in sync with props
  frequencyRef.current = frequency;
  centerFrequencyRef.current = centerFrequency;
  bandwidthRef.current = bandwidth;

  const formatFrequency = (freq: number): string[] => {
    // Format as GG.MMM.KKK (8 digits: 2 GHz + 3 MHz + 3 kHz)
    // Supports 00.000.000 to 06.000.000 (6 GHz)
    const khz = Math.floor(freq / 1e3);
    const ghzPart = Math.floor(khz / 1e6);
    const mhzPart = Math.floor((khz % 1e6) / 1e3);
    const khzPart = khz % 1e3;

    const ghzStr = ghzPart.toString().padStart(2, '0');
    const mhzStr = mhzPart.toString().padStart(3, '0');
    const khzStr = khzPart.toString().padStart(3, '0');

    return [
      ...ghzStr.split(''),
      '.',
      ...mhzStr.split(''),
      '.',
      ...khzStr.split(''),
    ];
  };

  const formatBandwidth = (bw: number): string[] => {
    // Format as MMM.KKK (6 digits: 3 MHz + 3 kHz)
    // Supports 001.750 to 200.000 MHz
    const khz = Math.floor(bw / 1e3);
    const mhzPart = Math.floor(khz / 1e3);
    const khzPart = khz % 1e3;

    const mhzStr = mhzPart.toString().padStart(3, '0');
    const khzStr = khzPart.toString().padStart(3, '0');

    return [
      ...mhzStr.split(''),
      '.',
      ...khzStr.split(''),
    ];
  };

  const adjustValue = useCallback((
    control: 'freq' | 'center' | 'bw',
    digitIndex: number,
    direction: 'up' | 'down'
  ) => {
    if (control === 'freq') {
      const multiplier = freqMultipliers[digitIndex];
      if (multiplier === 0) return;
      const delta = direction === 'up' ? multiplier : -multiplier;
      const newFreq = Math.max(0, Math.min(6e9, frequencyRef.current + delta));
      onChange(newFreq);
    } else if (control === 'center') {
      const multiplier = freqMultipliers[digitIndex];
      if (multiplier === 0) return;
      const delta = direction === 'up' ? multiplier : -multiplier;
      const newFreq = Math.max(0, Math.min(6e9, centerFrequencyRef.current + delta));
      onCenterFrequencyChange(newFreq);
    } else if (control === 'bw') {
      const multiplier = bwMultipliers[digitIndex];
      if (multiplier === 0) return;
      const delta = direction === 'up' ? multiplier : -multiplier;
      const newBw = Math.max(1.75e6, Math.min(200e6, bandwidthRef.current + delta));
      onBandwidthChange(newBw);
    }
  }, [onChange, onCenterFrequencyChange, onBandwidthChange]);

  const startContinuousAdjust = useCallback((
    control: 'freq' | 'center' | 'bw',
    digitIndex: number,
    direction: 'up' | 'down'
  ) => {
    adjustValue(control, digitIndex, direction);
    intervalRef.current = setInterval(() => {
      adjustValue(control, digitIndex, direction);
    }, 100);
  }, [adjustValue]);

  const stopContinuousAdjust = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const renderDigitControl = (
    digits: string[],
    control: 'freq' | 'center' | 'bw',
    label: string
  ) => {
    return (
      <div className="flex flex-col items-center">
        <div className="text-[9px] text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
        <div className="flex items-center gap-0.5">
          {digits.map((digit, index) => {
            const isDecimal = digit === '.';
            const digitKey = `${control}-${index}`;

            return (
              <div
                key={index}
                className={`relative ${isDecimal ? 'w-2' : 'w-5'} ${!isDecimal ? 'cursor-pointer' : ''}`}
                onMouseEnter={() => !isDecimal && setActiveDigit(digitKey)}
                onMouseLeave={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
                    return;
                  }
                  setActiveDigit(null);
                  stopContinuousAdjust();
                }}
              >
                {!isDecimal && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startContinuousAdjust(control, index, 'up');
                    }}
                    onMouseUp={stopContinuousAdjust}
                    onMouseLeave={stopContinuousAdjust}
                    onMouseEnter={() => setActiveDigit(digitKey)}
                    className={`absolute -top-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                      activeDigit === digitKey ? 'opacity-100 visible' : 'opacity-0 invisible'
                    }`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                )}

                <span
                  className={`frequency-display text-xl block text-center transition-colors ${
                    !isDecimal && activeDigit === digitKey ? 'text-accent' : ''
                  }`}
                >
                  {digit}
                </span>

                {!isDecimal && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startContinuousAdjust(control, index, 'down');
                    }}
                    onMouseUp={stopContinuousAdjust}
                    onMouseLeave={stopContinuousAdjust}
                    onMouseEnter={() => setActiveDigit(digitKey)}
                    className={`absolute -bottom-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                      activeDigit === digitKey ? 'opacity-100 visible' : 'opacity-0 invisible'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          <span className="text-sm text-muted-foreground ml-1 font-display">MHz</span>
        </div>
      </div>
    );
  };

  const freqDigits = formatFrequency(frequency);
  const centerDigits = formatFrequency(centerFrequency);
  const bwDigits = formatBandwidth(bandwidth);

  return (
    <div className="panel">
      <div className="panel-header">Frequency Control</div>

      <div className="flex items-center justify-center gap-6 py-6">
        {renderDigitControl(centerDigits, 'center', 'Center')}
        {renderDigitControl(freqDigits, 'freq', 'Tuned')}
        {renderDigitControl(bwDigits, 'bw', 'Span')}
      </div>

      {/* Quick frequency buttons */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {[
          { label: 'FM Radio', freq: 100e6 },
          { label: 'Air Band', freq: 118e6 },
          { label: 'VHF Marine', freq: 156e6 },
          { label: 'WiFi 2.4G', freq: 2.4e9 },
          { label: 'ISM 433', freq: 433e6 },
          { label: 'ISM 868', freq: 868e6 },
        ].map((preset) => (
          <button
            key={preset.label}
            onClick={() => onChange(preset.freq)}
            className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-sm hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FrequencyControl;
