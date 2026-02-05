import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onMuteToggle: () => void;
}

const VolumeControl = ({ volume, isMuted, onVolumeChange, onMuteToggle }: VolumeControlProps) => {
  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeX className="w-4 h-4" />;
    if (volume < 50) return <Volume1 className="w-4 h-4" />;
    return <Volume2 className="w-4 h-4" />;
  };

  return (
    <div className="panel">
      <div className="panel-header">Audio Output</div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onMuteToggle}
            className={`p-2 rounded-sm transition-colors ${
              isMuted ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-primary hover:bg-muted'
            }`}
          >
            {getVolumeIcon()}
          </button>
          
          <div className="flex-1">
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={(v) => onVolumeChange(v[0])}
              max={100}
              min={0}
              step={1}
              disabled={isMuted}
              className="cursor-pointer"
            />
          </div>
          
          <span className="text-sm font-mono text-primary w-12 text-right">
            {isMuted ? '---' : `${volume}%`}
          </span>
        </div>

        {/* Visual level meter */}
        <div className="flex gap-0.5 h-2">
          {[...Array(20)].map((_, i) => {
            const threshold = i * 5;
            const isActive = !isMuted && volume > threshold;
            
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-colors ${
                  isActive
                    ? i > 15 ? 'bg-destructive' : i > 12 ? 'bg-warning' : 'bg-accent'
                    : 'bg-secondary'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VolumeControl;
