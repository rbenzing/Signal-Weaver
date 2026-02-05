import { Usb, Thermometer, Zap, Clock, RefreshCw } from 'lucide-react';

interface DeviceStatusProps {
  isConnected: boolean;
  serialNumber?: string;
  firmwareVersion?: string;
  onConnect: () => void;
}

const DeviceStatus = ({ isConnected, serialNumber, firmwareVersion, onConnect }: DeviceStatusProps) => {
  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <span>HackRF One</span>
        <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-accent' : 'text-destructive'}`}>
          <Usb className="w-3 h-3" />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      
      {!isConnected ? (
        <div className="text-center py-4">
          <p className="text-muted-foreground text-sm mb-3">No device detected</p>
          <button
            onClick={onConnect}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/80 transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Connect Device
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              <div>
                <div className="text-muted-foreground">Frequency Range</div>
                <div className="text-foreground">1 MHz - 6 GHz</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <div>
                <div className="text-muted-foreground">Max Sample Rate</div>
                <div className="text-foreground">20 MS/s</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-accent" />
              <div>
                <div className="text-muted-foreground">Resolution</div>
                <div className="text-foreground">8-bit I/Q</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-secondary-foreground" />
              <div>
                <div className="text-muted-foreground">TX Power</div>
                <div className="text-foreground">0 - 15 dBm</div>
              </div>
            </div>
          </div>

          {/* Firmware info */}
          <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
            <div className="flex justify-between">
              <span>Firmware</span>
              <span>{firmwareVersion || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span>Serial</span>
              <span>{serialNumber || 'Unknown'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DeviceStatus;
