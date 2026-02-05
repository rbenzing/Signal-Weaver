import { Radio, Mic, Square, Circle, AlertTriangle } from 'lucide-react';

interface TransceiverControlProps {
  isTxMode: boolean;
  isRecording: boolean;
  isActive: boolean;
  onTxToggle: () => void;
  onRecordToggle: () => void;
  onActiveToggle: () => void;
}

const TransceiverControl = ({
  isTxMode,
  isRecording,
  isActive,
  onTxToggle,
  onRecordToggle,
  onActiveToggle,
}: TransceiverControlProps) => {
  return (
    <div className="panel">
      <div className="panel-header">Transceiver Control</div>
      
      <div className="space-y-4">
        {/* TX/RX Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => !isTxMode && onTxToggle()}
            className={`flex-1 py-3 rounded-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              !isTxMode 
                ? 'btn-rx' 
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            <Radio className="w-4 h-4" />
            RX
          </button>
          <button
            onClick={() => isTxMode || onTxToggle()}
            className={`flex-1 py-3 rounded-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isTxMode 
                ? 'btn-tx animate-pulse' 
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            <Mic className="w-4 h-4" />
            TX
          </button>
        </div>

        {/* TX Warning */}
        {isTxMode && (
          <div className="flex items-center gap-2 p-2 bg-warning/20 border border-warning rounded-sm text-warning text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>TRANSMITTING - Ensure proper licensing</span>
          </div>
        )}

        {/* Start/Stop and Record */}
        <div className="flex gap-2">
          <button
            onClick={onActiveToggle}
            className={`flex-1 py-2 rounded-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isActive
                ? 'bg-accent text-accent-foreground shadow-[0_0_15px_hsl(120_100%_50%/0.5)]'
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            {isActive ? <Square className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            {isActive ? 'Stop' : 'Start'}
          </button>
          
          <button
            onClick={onRecordToggle}
            disabled={!isActive}
            className={`flex-1 py-2 rounded-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isRecording
                ? 'bg-destructive text-destructive-foreground shadow-[0_0_15px_hsl(0_80%_50%/0.5)] animate-pulse'
                : 'bg-secondary text-secondary-foreground hover:bg-muted disabled:opacity-50'
            }`}
          >
            <Circle className={`w-3 h-3 ${isRecording ? 'fill-current' : ''}`} />
            {isRecording ? 'Recording' : 'Record'}
          </button>
        </div>

        {/* Status LEDs */}
        <div className="flex justify-around pt-2 border-t border-border">
          <div className="flex flex-col items-center gap-1">
            <div className={`led ${isActive ? 'led-on' : 'led-off'}`} />
            <span className="text-[10px] text-muted-foreground">ACTIVE</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={`led ${isTxMode ? 'led-tx' : 'led-off'}`} />
            <span className="text-[10px] text-muted-foreground">TX</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={`led ${isRecording ? 'bg-destructive shadow-[0_0_10px_hsl(0_80%_50%/0.8)]' : 'led-off'}`} />
            <span className="text-[10px] text-muted-foreground">REC</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="led led-on" />
            <span className="text-[10px] text-muted-foreground">USB</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransceiverControl;
