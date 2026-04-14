interface SignalMeterProps {
  isActive: boolean;
  signalStrength?: number;
  peakHold?: number;
  noiseFloor?: number;
}

const SignalMeter = ({
  isActive,
  signalStrength = -100,
  peakHold = -100,
  noiseFloor,
}: SignalMeterProps) => {
  const displayStrength = isActive ? signalStrength : -100;
  const displayPeak = isActive ? peakHold : -100;

  const normalizedSignal = Math.max(0, Math.min(100, (displayStrength + 100) * 1.25));
  const normalizedPeak = Math.max(0, Math.min(100, (displayPeak + 100) * 1.25));

  // SNR: use noiseFloor if provided, else fall back to (peak - signalStrength)
  const snr = noiseFloor !== undefined
    ? displayPeak - noiseFloor
    : displayPeak - displayStrength;

  const getColor = (value: number) => {
    if (value > 75) return 'hsl(0, 100%, 50%)';
    if (value > 50) return 'hsl(60, 100%, 50%)';
    return 'hsl(120, 100%, 50%)';
  };

  const snrColorClass = !isActive
    ? 'text-secondary-foreground'
    : snr >= 15
    ? 'text-green-400'
    : snr >= 5
    ? 'text-yellow-400'
    : 'text-red-400';

  return (
    <div className="panel">
      <div className="panel-header">Signal Strength</div>

      <div className="space-y-3">
        {/* S-Meter style display */}
        <div className="flex gap-0.5">
          {[...Array(20)].map((_, i) => {
            const threshold = i * 5;
            const barActive = normalizedSignal > threshold;
            const isPeak = Math.abs(normalizedPeak - threshold) < 5;

            return (
              <div
                key={i}
                className={`h-6 flex-1 rounded-sm transition-all duration-75 ${
                  barActive || isPeak ? '' : 'bg-secondary'
                }`}
                style={{
                  backgroundColor: barActive
                    ? getColor(threshold)
                    : isPeak
                    ? getColor(normalizedPeak)
                    : undefined,
                  boxShadow: barActive ? `0 0 8px ${getColor(threshold)}` : undefined,
                  opacity: isPeak && !barActive ? 0.5 : 1,
                }}
              />
            );
          })}
        </div>

        {/* Scale */}
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>S1</span>
          <span>S3</span>
          <span>S5</span>
          <span>S7</span>
          <span>S9</span>
          <span>+20</span>
          <span>+40</span>
        </div>

        {/* Numeric display */}
        <div className="flex justify-between items-center">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Signal</div>
            <div className="text-lg font-bold text-primary font-display">
              {isActive ? `${displayStrength.toFixed(1)} dB` : '---'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Peak</div>
            <div className="text-lg font-bold text-accent font-display">
              {isActive ? `${displayPeak.toFixed(1)} dB` : '---'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">SNR</div>
            <div className={`text-lg font-bold font-display ${snrColorClass}`}>
              {isActive ? `${snr.toFixed(1)} dB` : '---'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalMeter;
