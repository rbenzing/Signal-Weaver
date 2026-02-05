interface ModeSelectorProps {
  mode: string;
  onChange: (mode: string) => void;
}

const MODES = [
  { id: 'AM', label: 'AM', desc: 'Amplitude Modulation' },
  { id: 'FM', label: 'FM', desc: 'Frequency Modulation' },
  { id: 'WFM', label: 'WFM', desc: 'Wide FM' },
  { id: 'USB', label: 'USB', desc: 'Upper Sideband' },
  { id: 'LSB', label: 'LSB', desc: 'Lower Sideband' },
  { id: 'CW', label: 'CW', desc: 'Continuous Wave' },
  { id: 'RAW', label: 'RAW', desc: 'Raw I/Q' },
];

const ModeSelector = ({ mode, onChange }: ModeSelectorProps) => {
  return (
    <div className="panel">
      <div className="panel-header">Demodulation Mode</div>
      
      <div className="grid grid-cols-4 gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`
              py-2 px-3 text-xs font-bold rounded-sm transition-all
              ${mode === m.id 
                ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsl(180_100%_50%/0.5)]' 
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
              }
            `}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModeSelector;
