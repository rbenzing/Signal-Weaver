import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FrequencyControlProps {
  frequency: number;
  onChange: (freq: number) => void;
}

const FrequencyControl = ({ frequency, onChange }: FrequencyControlProps) => {
  const [activeDigit, setActiveDigit] = useState<number | null>(null);

  const formatFrequency = (freq: number): string[] => {
    const ghz = Math.floor(freq / 1e9);
    const mhz = Math.floor((freq % 1e9) / 1e6);
    const khz = Math.floor((freq % 1e6) / 1e3);
    const hz = Math.floor(freq % 1e3);

    return [
      ghz.toString().padStart(1, '0'),
      '.',
      mhz.toString().padStart(3, '0'),
      '.',
      khz.toString().padStart(3, '0'),
      '.',
      hz.toString().padStart(3, '0'),
    ];
  };

  const adjustFrequency = (digitIndex: number, direction: 'up' | 'down') => {
    const multipliers = [1e9, 0, 1e8, 1e7, 1e6, 0, 1e5, 1e4, 1e3, 0, 1e2, 1e1, 1];
    const multiplier = multipliers[digitIndex];
    if (multiplier === 0) return;

    const delta = direction === 'up' ? multiplier : -multiplier;
    const newFreq = Math.max(1e6, Math.min(6e9, frequency + delta));
    onChange(newFreq);
  };

  const digits = formatFrequency(frequency);

  return (
    <div className="panel">
      <div className="panel-header">Frequency</div>
      
      <div className="flex items-center justify-center gap-1 py-6">
        {digits.map((digit, index) => {
          const isDecimal = digit === '.';
          
          return (
            <div
              key={index}
              className={`relative ${isDecimal ? 'w-2' : 'w-7'} ${!isDecimal ? 'cursor-pointer' : ''}`}
              onMouseEnter={() => !isDecimal && setActiveDigit(index)}
              onMouseLeave={(e) => {
                // Check if we're leaving to a child element (the buttons)
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
                  return;
                }
                setActiveDigit(null);
              }}
            >
              {!isDecimal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustFrequency(index, 'up');
                  }}
                  onMouseEnter={() => setActiveDigit(index)}
                  className={`absolute -top-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                    activeDigit === index ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
              )}
              
              <span
                className={`frequency-display text-2xl block text-center transition-colors ${
                  !isDecimal && activeDigit === index ? 'text-accent' : ''
                }`}
              >
                {digit}
              </span>
              
              {!isDecimal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustFrequency(index, 'down');
                  }}
                  onMouseEnter={() => setActiveDigit(index)}
                  className={`absolute -bottom-5 left-0 right-0 flex justify-center text-primary hover:text-accent transition-all ${
                    activeDigit === index ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                >
                  <ChevronDown className="w-5 h-5" />
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
