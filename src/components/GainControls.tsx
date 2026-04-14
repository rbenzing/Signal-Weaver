import { Slider } from '@/components/ui/slider';

interface GainControlsProps {
  lnaGain: number;
  vgaGain: number;
  ampEnabled: boolean;
  onLnaChange: (value: number) => void;
  onVgaChange: (value: number) => void;
  onAmpToggle: (enabled: boolean) => void;
  isTxMode: boolean;
}

const GainControls = ({
  lnaGain,
  vgaGain,
  ampEnabled,
  onLnaChange,
  onVgaChange,
  onAmpToggle,
  isTxMode,
}: GainControlsProps) => {
  return (
    <div className="panel">
      <div className="panel-header">Gain Controls</div>

      <div className="space-y-4">
        {/* LNA Gain */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">LNA Gain</span>
            <span className="text-primary font-bold">{lnaGain} dB</span>
          </div>
          <Slider
            value={[lnaGain]}
            onValueChange={(v) => onLnaChange(v[0])}
            max={40}
            min={0}
            step={8}
            disabled={isTxMode}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>8</span>
            <span>16</span>
            <span>24</span>
            <span>32</span>
            <span>40</span>
          </div>
        </div>

        {/* VGA Gain (RX) */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">VGA Gain (RX)</span>
            <span className="text-primary font-bold">{vgaGain} dB</span>
          </div>
          <Slider
            value={[vgaGain]}
            onValueChange={(v) => onVgaChange(v[0])}
            max={62}
            min={0}
            step={2}
            disabled={isTxMode}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>32</span>
            <span>62</span>
          </div>
        </div>

        {/* RF Amp Enable */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <div>
              <span className="text-muted-foreground">RF Amp</span>
              <span className="text-[10px] text-muted-foreground ml-1">(+14 dB hardware)</span>
            </div>
            <button
              onClick={() => onAmpToggle(!ampEnabled)}
              disabled={isTxMode}
              className={`px-3 py-1 rounded-sm text-xs font-bold transition-colors ${
                ampEnabled
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {ampEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Broadband hardware preamp. Enable for weak signals; may cause distortion near strong transmitters.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GainControls;
