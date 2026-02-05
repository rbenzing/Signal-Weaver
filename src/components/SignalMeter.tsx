import { useEffect, useState } from 'react';

interface SignalMeterProps {
  isActive: boolean;
}

const SignalMeter = ({ isActive }: SignalMeterProps) => {
  const [signalStrength, setSignalStrength] = useState(-80);
  const [peakHold, setPeakHold] = useState(-80);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const newStrength = -90 + Math.random() * 50 + Math.sin(Date.now() / 1000) * 10;
      setSignalStrength(newStrength);
      
      if (newStrength > peakHold) {
        setPeakHold(newStrength);
      }
    }, 100);

    const peakDecay = setInterval(() => {
      setPeakHold((prev) => Math.max(prev - 0.5, signalStrength));
    }, 500);

    return () => {
      clearInterval(interval);
      clearInterval(peakDecay);
    };
  }, [isActive, signalStrength, peakHold]);

  const normalizedSignal = Math.max(0, Math.min(100, (signalStrength + 100) * 1.25));
  const normalizedPeak = Math.max(0, Math.min(100, (peakHold + 100) * 1.25));

  const getColor = (value: number) => {
    if (value > 75) return 'hsl(0, 100%, 50%)';
    if (value > 50) return 'hsl(60, 100%, 50%)';
    return 'hsl(120, 100%, 50%)';
  };

  return (
    <div className="panel">
      <div className="panel-header">Signal Strength</div>
      
      <div className="space-y-3">
        {/* S-Meter style display */}
        <div className="flex gap-0.5">
          {[...Array(20)].map((_, i) => {
            const threshold = i * 5;
            const isActive = normalizedSignal > threshold;
            const isPeak = Math.abs(normalizedPeak - threshold) < 5;
            
            return (
              <div
                key={i}
                className={`h-6 flex-1 rounded-sm transition-all duration-75 ${
                  isActive || isPeak
                    ? ''
                    : 'bg-secondary'
                }`}
                style={{
                  backgroundColor: isActive ? getColor(threshold) : isPeak ? getColor(normalizedPeak) : undefined,
                  boxShadow: isActive ? `0 0 8px ${getColor(threshold)}` : undefined,
                  opacity: isPeak && !isActive ? 0.5 : 1,
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
              {signalStrength.toFixed(1)} dB
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Peak</div>
            <div className="text-lg font-bold text-accent font-display">
              {peakHold.toFixed(1)} dB
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">SNR</div>
            <div className="text-lg font-bold text-secondary-foreground font-display">
              {(signalStrength + 90).toFixed(1)} dB
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalMeter;
