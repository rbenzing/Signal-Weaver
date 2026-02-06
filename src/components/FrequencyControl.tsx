import { useState, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FrequencyControlProps {
  frequency: number;
  onChange: (freq: number) => void;
}

const FrequencyControl = ({ frequency, onChange }: FrequencyControlProps) => {
  const [activeDigit, setActiveDigit] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frequencyRef = useRef(frequency);
  
  // Keep ref in sync with prop
  frequencyRef.current = frequency;

  const formatFrequency = (freq: number): string[] => {
    const ghz = Math.floor(freq / 1e9);
    const mhz = Math.floor((freq % 1e9) / 1e6);
    const khz = Math.floor((freq % 1e6) / 1e3);
    const hz = Math.floor(freq % 1e3);

    const ghzStr = ghz.toString().padStart(1, '0');
    const mhzStr = mhz.toString().padStart(3, '0');
    const khzStr = khz.toString().padStart(3, '0');
    const hzStr = hz.toString().padStart(3, '0');

    // Split into individual characters for proper digit-by-digit control
    return [
      ...ghzStr.split(''),    // index 0: GHz
      '.',                     // index 1: decimal
      ...mhzStr.split(''),    // index 2,3,4: MHz (100s, 10s, 1s)
      '.',                     // index 5: decimal
      ...khzStr.split(''),    // index 6,7,8: kHz (100s, 10s, 1s)
      '.',                     // index 9: decimal
      ...hzStr.split(''),     // index 10,11,12: Hz (100s, 10s, 1s)
    ];
  };

  // Multipliers for each digit position (matches the split digit array)
  const multipliers = [
    1e9,  // index 0: GHz
    0,    // index 1: decimal
    1e8,  // index 2: 100 MHz
    1e7,  // index 3: 10 MHz
    1e6,  // index 4: 1 MHz
    0,    // index 5: decimal
    1e5,  // index 6: 100 kHz
    1e4,  // index 7: 10 kHz
    1e3,  // index 8: 1 kHz
    0,    // index 9: decimal
    1e2,  // index 10: 100 Hz
    1e1,  // index 11: 10 Hz
    1,    // index 12: 1 Hz
  ];

  const adjustFrequency = useCallback((digitIndex: number, direction: 'up' | 'down') => {
    const multiplier = multipliers[digitIndex];
    if (multiplier === 0) return;

    const delta = direction === 'up' ? multiplier : -multiplier;
    const newFreq = Math.max(1e6, Math.min(6e9, frequencyRef.current + delta));
    onChange(newFreq);
  }, [onChange]);

  const startContinuousAdjust = useCallback((digitIndex: number, direction: 'up' | 'down') => {
    // Initial adjustment
    adjustFrequency(digitIndex, direction);
    
    // Start continuous adjustment after delay
    intervalRef.current = setInterval(() => {
      adjustFrequency(digitIndex, direction);
    }, 100);
  }, [adjustFrequency]);

  const stopContinuousAdjust = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const digits = formatFrequency(frequency);

  return (
    <div className="panel">
      <div className="panel-header">Frequency</div>
      
      <div className="flex items-center justify-center gap-0.5 py-6">
        {digits.map((digit, index) => {
          const isDecimal = digit === '.';
          
          return (
            <div
              key={index}
              className={`relative ${isDecimal ? 'w-2' : 'w-5'} ${!isDecimal ? 'cursor-pointer' : ''}`}
              onMouseEnter={() => !isDecimal && setActiveDigit(index)}
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
                    startContinuousAdjust(index, 'up');
                  }}
                  onMouseUp={stopContinuousAdjust}
                  onMouseLeave={stopContinuousAdjust}
                  onMouseEnter={() => setActiveDigit(index)}
                  className={`absolute -top-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                    activeDigit === index ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              )}
              
              <span
                className={`frequency-display text-xl block text-center transition-colors ${
                  !isDecimal && activeDigit === index ? 'text-accent' : ''
                }`}
              >
                {digit}
              </span>
              
              {!isDecimal && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startContinuousAdjust(index, 'down');
                  }}
                  onMouseUp={stopContinuousAdjust}
                  onMouseLeave={stopContinuousAdjust}
                  onMouseEnter={() => setActiveDigit(index)}
                  className={`absolute -bottom-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                    activeDigit === index ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
        <span className="text-sm text-muted-foreground ml-[10px] font-display">Hz</span>
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
