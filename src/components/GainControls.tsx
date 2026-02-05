import { Slider } from '@/components/ui/slider';

interface GainControlsProps {
  lnaGain: number;
  vgaGain: number;
  txVgaGain: number;
  onLnaChange: (value: number) => void;
  onVgaChange: (value: number) => void;
  onTxVgaChange: (value: number) => void;
  isTxMode: boolean;
}

const GainControls = ({
  lnaGain,
  vgaGain,
  txVgaGain,
  onLnaChange,
  onVgaChange,
  onTxVgaChange,
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
            <span>31</span>
            <span>62</span>
          </div>
        </div>

        {/* TX VGA Gain */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">TX VGA Gain</span>
            <span className={`font-bold ${isTxMode ? 'text-warning' : 'text-primary'}`}>{txVgaGain} dB</span>
          </div>
          <Slider
            value={[txVgaGain]}
            onValueChange={(v) => onTxVgaChange(v[0])}
            max={47}
            min={0}
            step={1}
            disabled={!isTxMode}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>23</span>
            <span>47</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GainControls;
