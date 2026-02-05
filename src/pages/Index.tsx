import { useState } from 'react';
import SpectrumDisplay from '@/components/SpectrumDisplay';
import FrequencyControl from '@/components/FrequencyControl';
import GainControls from '@/components/GainControls';
import ModeSelector from '@/components/ModeSelector';
import SampleRateControl from '@/components/SampleRateControl';
import SignalMeter from '@/components/SignalMeter';
import TransceiverControl from '@/components/TransceiverControl';
import DeviceStatus from '@/components/DeviceStatus';
import { Settings, Antenna, Save, FolderOpen, HelpCircle } from 'lucide-react';

const Index = () => {
  const [frequency, setFrequency] = useState(100e6); // 100 MHz
  const [sampleRate, setSampleRate] = useState(10e6);
  const [bandwidth, setBandwidth] = useState(5e6);
  const [lnaGain, setLnaGain] = useState(24);
  const [vgaGain, setVgaGain] = useState(20);
  const [txVgaGain, setTxVgaGain] = useState(30);
  const [mode, setMode] = useState('FM');
  const [isTxMode, setIsTxMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isActive, setIsActive] = useState(true);

  return (
    <div className="min-h-screen bg-background p-2 flex flex-col gap-2">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 panel">
        <div className="flex items-center gap-3">
          <Antenna className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-display font-bold text-foreground tracking-wider">
            HACKRF<span className="text-primary">ONE</span>
          </h1>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-sm">
            SDR Interface
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors">
            <FolderOpen className="w-4 h-4" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors">
            <Save className="w-4 h-4" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-12 gap-2">
        {/* Left sidebar - Controls */}
        <div className="col-span-3 flex flex-col gap-2">
          <DeviceStatus isConnected={true} />
          <TransceiverControl
            isTxMode={isTxMode}
            isRecording={isRecording}
            isActive={isActive}
            onTxToggle={() => setIsTxMode(!isTxMode)}
            onRecordToggle={() => setIsRecording(!isRecording)}
            onActiveToggle={() => setIsActive(!isActive)}
          />
          <ModeSelector mode={mode} onChange={setMode} />
          <SampleRateControl
            sampleRate={sampleRate}
            bandwidth={bandwidth}
            onSampleRateChange={setSampleRate}
            onBandwidthChange={setBandwidth}
          />
        </div>

        {/* Center - Spectrum and Frequency */}
        <div className="col-span-6 flex flex-col gap-2">
          <FrequencyControl frequency={frequency} onChange={setFrequency} />
          <SpectrumDisplay
            centerFreq={frequency}
            bandwidth={sampleRate}
            isActive={isActive}
          />
        </div>

        {/* Right sidebar - Meters and Gains */}
        <div className="col-span-3 flex flex-col gap-2">
          <SignalMeter isActive={isActive} />
          <GainControls
            lnaGain={lnaGain}
            vgaGain={vgaGain}
            txVgaGain={txVgaGain}
            onLnaChange={setLnaGain}
            onVgaChange={setVgaGain}
            onTxVgaChange={setTxVgaGain}
            isTxMode={isTxMode}
          />
        </div>
      </div>

      {/* Footer status bar */}
      <footer className="flex items-center justify-between px-4 py-1 panel text-xs">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Mode: <span className="text-primary font-bold">{mode}</span>
          </span>
          <span className="text-muted-foreground">
            Sample Rate: <span className="text-primary">{(sampleRate / 1e6).toFixed(1)} MS/s</span>
          </span>
          <span className="text-muted-foreground">
            Filter BW: <span className="text-primary">{(bandwidth / 1e6).toFixed(2)} MHz</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1 ${isTxMode ? 'text-warning' : 'text-accent'}`}>
            <span className={`w-2 h-2 rounded-full ${isTxMode ? 'bg-warning animate-pulse' : 'bg-accent'}`} />
            {isTxMode ? 'TRANSMIT' : 'RECEIVE'}
          </span>
          {isRecording && (
            <span className="flex items-center gap-1 text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              REC
            </span>
          )}
        </div>
      </footer>
    </div>
  );
};

export default Index;
