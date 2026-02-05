import { useEffect, useRef, useState } from 'react';

interface SpectrumDisplayProps {
  centerFreq: number;
  bandwidth: number;
  isActive: boolean;
}

const SpectrumDisplay = ({ centerFreq, bandwidth, isActive }: SpectrumDisplayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterfallRef = useRef<HTMLCanvasElement>(null);
  const [spectrumData, setSpectrumData] = useState<number[]>([]);

  useEffect(() => {
    // Generate simulated spectrum data
    const generateSpectrum = () => {
      const data: number[] = [];
      const numPoints = 512;
      
      for (let i = 0; i < numPoints; i++) {
        // Base noise floor
        let value = -90 + Math.random() * 10;
        
        // Add some simulated signals
        const signals = [
          { pos: 0.25, strength: 40, width: 0.02 },
          { pos: 0.5, strength: 60, width: 0.03 },
          { pos: 0.7, strength: 30, width: 0.015 },
        ];
        
        signals.forEach(signal => {
          const dist = Math.abs(i / numPoints - signal.pos);
          if (dist < signal.width) {
            value += signal.strength * (1 - dist / signal.width) * (isActive ? 1 : 0.3);
          }
        });
        
        data.push(value);
      }
      
      return data;
    };

    const interval = setInterval(() => {
      if (isActive) {
        setSpectrumData(generateSpectrum());
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const waterfall = waterfallRef.current;
    if (!canvas || !waterfall) return;

    const ctx = canvas.getContext('2d');
    const wtfCtx = waterfall.getContext('2d');
    if (!ctx || !wtfCtx) return;

    // Clear and draw spectrum
    ctx.fillStyle = 'hsl(220, 20%, 4%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'hsl(180, 30%, 20%)';
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw spectrum line
    if (spectrumData.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'hsl(180, 100%, 50%)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'hsl(180, 100%, 50%)';
      ctx.shadowBlur = 10;

      spectrumData.forEach((value, i) => {
        const x = (i / spectrumData.length) * canvas.width;
        const normalizedValue = (value + 100) / 80;
        const y = canvas.height - (normalizedValue * canvas.height);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Fill under the curve
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fillStyle = 'hsla(180, 100%, 50%, 0.1)';
      ctx.fill();
    }

    // Update waterfall
    const imageData = wtfCtx.getImageData(0, 0, waterfall.width, waterfall.height - 1);
    wtfCtx.putImageData(imageData, 0, 1);

    // Draw new line at top
    spectrumData.forEach((value, i) => {
      const x = (i / spectrumData.length) * waterfall.width;
      const normalizedValue = (value + 100) / 80;
      
      // Color based on intensity
      const hue = 240 - normalizedValue * 240;
      wtfCtx.fillStyle = `hsl(${hue}, 100%, ${30 + normalizedValue * 40}%)`;
      wtfCtx.fillRect(x, 0, waterfall.width / spectrumData.length + 1, 1);
    });

  }, [spectrumData]);

  const formatFreq = (freq: number) => {
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(6)} GHz`;
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(6)} MHz`;
    if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`;
    return `${freq} Hz`;
  };

  return (
    <div className="panel flex-1">
      <div className="panel-header flex items-center justify-between">
        <span>Spectrum Analyzer</span>
        <div className="flex items-center gap-4 text-xs">
          <span>Center: {formatFreq(centerFreq)}</span>
          <span>Span: {formatFreq(bandwidth)}</span>
        </div>
      </div>
      
      <div className="relative">
        {/* Spectrum display */}
        <div className="relative h-48 border border-border rounded-sm overflow-hidden">
          <canvas 
            ref={canvasRef} 
            width={1024} 
            height={192}
            className="w-full h-full"
          />
          <div className="absolute inset-0 scanline pointer-events-none" />
          
          {/* dB scale */}
          <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[10px] text-muted-foreground">
            <span>0 dB</span>
            <span>-40</span>
            <span>-80</span>
          </div>
        </div>

        {/* Waterfall display */}
        <div className="relative h-32 border border-border border-t-0 rounded-sm overflow-hidden">
          <canvas 
            ref={waterfallRef} 
            width={1024} 
            height={128}
            className="w-full h-full"
          />
        </div>

        {/* Frequency scale */}
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-1">
          <span>{formatFreq(centerFreq - bandwidth / 2)}</span>
          <span>{formatFreq(centerFreq - bandwidth / 4)}</span>
          <span>{formatFreq(centerFreq)}</span>
          <span>{formatFreq(centerFreq + bandwidth / 4)}</span>
          <span>{formatFreq(centerFreq + bandwidth / 2)}</span>
        </div>
      </div>
    </div>
  );
};

export default SpectrumDisplay;
