import { useState } from 'react';
import SpectrumDisplay from '@/components/SpectrumDisplay';
import FrequencyControl from '@/components/FrequencyControl';
import GainControls from '@/components/GainControls';
import ModeSelector from '@/components/ModeSelector';
import SampleRateControl from '@/components/SampleRateControl';
import SignalMeter from '@/components/SignalMeter';
import TransceiverControl from '@/components/TransceiverControl';
import DeviceStatus from '@/components/DeviceStatus';
import VolumeControl from '@/components/VolumeControl';
import SettingsDialog from '@/components/SettingsDialog';
import { useSDR } from '@/hooks/useSDR';
import type { DemodMode } from '@/lib/interfaces';
import { Settings, Antenna, Save, FolderOpen, HelpCircle } from 'lucide-react';

const Index = () => {
  const [frequency, setFrequency] = useState(105.5e6);
  const [sampleRate, setSampleRate] = useState(8e6);
  const [bandwidth, setBandwidth] = useState(6e6); // Baseband filter bandwidth (HackRF hardware filter)
  const [lnaGain, setLnaGain] = useState(32); // 32 dB recommended for FM broadcast reception
  const [vgaGain, setVgaGain] = useState(32); // 32 dB recommended for FM broadcast reception
  const [ampEnabled, setAmpEnabled] = useState(false);
  const [mode, setMode] = useState<DemodMode>('FM');
  const [isTxMode, setIsTxMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);

  const [audioSettings, setAudioSettings] = useState({
    outputDevice: 'default',
    sampleRate: 48000,
    bufferSize: 1024,
    agcEnabled: true,
    noiseBlanker: false,
    squelchLevel: -80,
  });

  const sdr = useSDR({
    mode,
    volume,
    isMuted,
    frequency,
    sampleRate,
    bandwidth,
    lnaGain,
    vgaGain,
    ampEnabled,
    audioOutputDevice: audioSettings.outputDevice,
  });

  const handleActiveToggle = async () => {
    if (sdr.isActive) {
      sdr.stopStreaming();
    } else {
      await sdr.startStreaming();
    }
  };

  const handleModeChange = (newMode: string) => {
    setMode(newMode as DemodMode);
    sdr.setMode(newMode as DemodMode);
  };

  const handleFrequencyChange = (freq: number) => {
    setFrequency(freq);
    sdr.setFrequency(freq);
  };

  const handleSampleRateChange = (rate: number) => {
    setSampleRate(rate);
    sdr.setSampleRate(rate);
  };

  const handleBandwidthChange = (bw: number) => {
    setBandwidth(bw);
    sdr.setBasebandFilter(bw);
  };

  const handleLnaChange = (gain: number) => {
    setLnaGain(gain);
    sdr.setLnaGain(gain);
  };

  const handleVgaChange = (gain: number) => {
    setVgaGain(gain);
    sdr.setVgaGain(gain);
  };

  const handleAmpToggle = (enabled: boolean) => {
    setAmpEnabled(enabled);
    sdr.setAmpEnable(enabled);
  };

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
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-sm transition-colors">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={audioSettings}
          onSettingsChange={setAudioSettings}
        />
      </header>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-12 gap-2">
        {/* Left sidebar - Controls */}
        <div className="col-span-3 flex flex-col gap-2">
          <DeviceStatus
            isConnected={sdr.isConnected}
            serialNumber={sdr.serialNumber}
            firmwareVersion={sdr.firmwareVersion}
            onConnect={sdr.connect}
          />
          <TransceiverControl
            isTxMode={isTxMode}
            isRecording={isRecording}
            isActive={sdr.isActive}
            isConnected={sdr.isConnected}
            onTxToggle={() => setIsTxMode(!isTxMode)}
            onRecordToggle={() => setIsRecording(!isRecording)}
            onActiveToggle={handleActiveToggle}
          />
          <ModeSelector mode={mode} onChange={handleModeChange} />
          <SampleRateControl
            sampleRate={sampleRate}
            bandwidth={bandwidth}
            onSampleRateChange={handleSampleRateChange}
            onBandwidthChange={handleBandwidthChange}
          />
        </div>

        {/* Center - Spectrum and Frequency */}
        <div className="col-span-6 flex flex-col gap-2">
          <FrequencyControl
            frequency={frequency}
            onChange={handleFrequencyChange}
            centerFrequency={sdr.centerFrequency}
            bandwidth={bandwidth}
            onCenterFrequencyChange={sdr.setCenterFrequency}
            onBandwidthChange={handleBandwidthChange}
          />
          <SpectrumDisplay
            centerFreq={frequency}
            bandwidth={sampleRate}
            isActive={sdr.isActive && sdr.isConnected}
            spectrumData={sdr.spectrumData}
          />
        </div>

        {/* Right sidebar - Meters and Gains */}
        <div className="col-span-3 flex flex-col gap-2">
          <SignalMeter
            isActive={sdr.isActive && sdr.isConnected}
            signalStrength={sdr.signalStrength}
            peakHold={sdr.peakHold}
            noiseFloor={sdr.noiseFloor}
          />
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onMuteToggle={() => setIsMuted(!isMuted)}
          />
          <GainControls
            lnaGain={lnaGain}
            vgaGain={vgaGain}
            ampEnabled={ampEnabled}
            onLnaChange={handleLnaChange}
            onVgaChange={handleVgaChange}
            onAmpToggle={handleAmpToggle}
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
          {!sdr.isConnected ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted" />
              NO DEVICE
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
      </footer>
    </div>
  );
};

export default Index;
