import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Volume2, Headphones, Speaker } from 'lucide-react';

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface AudioSettings {
  outputDevice: string;
  sampleRate: number;
  bufferSize: number;
  agcEnabled: boolean;
  noiseBlanker: boolean;
  squelchLevel: number;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AudioSettings;
  onSettingsChange: (settings: AudioSettings) => void;
}

const SettingsDialog = ({ open, onOpenChange, settings, onSettingsChange }: SettingsDialogProps) => {
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        // Request permissions first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`
          }));
        setAudioDevices(outputs);
      } catch (error) {
        console.log('Could not enumerate audio devices:', error);
        setAudioDevices([{ deviceId: 'default', label: 'System Default' }]);
      }
    };

    if (open) {
      getAudioDevices();
    }
  }, [open]);

  const updateSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground font-display flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" />
            Audio Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Output Device */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground flex items-center gap-2">
              <Speaker className="w-4 h-4" />
              Output Device
            </Label>
            <Select
              value={settings.outputDevice}
              onValueChange={(v) => updateSetting('outputDevice', v)}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Select output device" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {audioDevices.map(device => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audio Sample Rate */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Audio Sample Rate
            </Label>
            <Select
              value={settings.sampleRate.toString()}
              onValueChange={(v) => updateSetting('sampleRate', parseInt(v))}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="22050">22.05 kHz</SelectItem>
                <SelectItem value="44100">44.1 kHz</SelectItem>
                <SelectItem value="48000">48 kHz</SelectItem>
                <SelectItem value="96000">96 kHz</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Buffer Size */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Buffer Size
            </Label>
            <Select
              value={settings.bufferSize.toString()}
              onValueChange={(v) => updateSetting('bufferSize', parseInt(v))}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="256">256 samples (low latency)</SelectItem>
                <SelectItem value="512">512 samples</SelectItem>
                <SelectItem value="1024">1024 samples</SelectItem>
                <SelectItem value="2048">2048 samples (stable)</SelectItem>
                <SelectItem value="4096">4096 samples (high stability)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Squelch Level */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-sm text-muted-foreground">Squelch Level</Label>
              <span className="text-sm text-primary font-mono">{settings.squelchLevel} dB</span>
            </div>
            <Slider
              value={[settings.squelchLevel]}
              onValueChange={(v) => updateSetting('squelchLevel', v[0])}
              min={-100}
              max={0}
              step={1}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-100 dB (Off)</span>
              <span>0 dB</span>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Automatic Gain Control</Label>
                <p className="text-xs text-muted-foreground">Auto-adjust audio levels</p>
              </div>
              <Switch
                checked={settings.agcEnabled}
                onCheckedChange={(v) => updateSetting('agcEnabled', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Noise Blanker</Label>
                <p className="text-xs text-muted-foreground">Reduce impulse noise</p>
              </div>
              <Switch
                checked={settings.noiseBlanker}
                onCheckedChange={(v) => updateSetting('noiseBlanker', v)}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
