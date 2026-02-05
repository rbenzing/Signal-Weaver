import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SampleRateControlProps {
  sampleRate: number;
  bandwidth: number;
  onSampleRateChange: (rate: number) => void;
  onBandwidthChange: (bw: number) => void;
}

const SAMPLE_RATES = [
  { value: 2e6, label: '2 MS/s' },
  { value: 4e6, label: '4 MS/s' },
  { value: 8e6, label: '8 MS/s' },
  { value: 10e6, label: '10 MS/s' },
  { value: 12.5e6, label: '12.5 MS/s' },
  { value: 16e6, label: '16 MS/s' },
  { value: 20e6, label: '20 MS/s' },
];

const BANDWIDTHS = [
  { value: 1.75e6, label: '1.75 MHz' },
  { value: 2.5e6, label: '2.5 MHz' },
  { value: 3.5e6, label: '3.5 MHz' },
  { value: 5e6, label: '5 MHz' },
  { value: 5.5e6, label: '5.5 MHz' },
  { value: 6e6, label: '6 MHz' },
  { value: 7e6, label: '7 MHz' },
  { value: 8e6, label: '8 MHz' },
  { value: 9e6, label: '9 MHz' },
  { value: 10e6, label: '10 MHz' },
  { value: 12e6, label: '12 MHz' },
  { value: 14e6, label: '14 MHz' },
  { value: 15e6, label: '15 MHz' },
  { value: 20e6, label: '20 MHz' },
  { value: 24e6, label: '24 MHz' },
  { value: 28e6, label: '28 MHz' },
];

const SampleRateControl = ({
  sampleRate,
  bandwidth,
  onSampleRateChange,
  onBandwidthChange,
}: SampleRateControlProps) => {
  return (
    <div className="panel">
      <div className="panel-header">Sampling</div>
      
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sample Rate</label>
          <Select
            value={sampleRate.toString()}
            onValueChange={(v) => onSampleRateChange(Number(v))}
          >
            <SelectTrigger className="bg-secondary border-border text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {SAMPLE_RATES.map((rate) => (
                <SelectItem key={rate.value} value={rate.value.toString()}>
                  {rate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Baseband Filter BW</label>
          <Select
            value={bandwidth.toString()}
            onValueChange={(v) => onBandwidthChange(Number(v))}
          >
            <SelectTrigger className="bg-secondary border-border text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {BANDWIDTHS.map((bw) => (
                <SelectItem key={bw.value} value={bw.value.toString()}>
                  {bw.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default SampleRateControl;
