import { useState } from 'react';
import { Room, createLocalVideoTrack, type Track } from 'livekit-client';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';
import { ArrowLeft, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PhoneCamera = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Idle');
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);

  const handleStart = async () => {
    try {
      setStatus('Getting token...');
      
      const response = await fetch(`/token?identity=phone&t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      setStatus(`Connecting to LiveKit... (${data.url})`);
      const roomConn = new Room({
        adaptiveStream: false,
        dynacast: false,
      });

      await roomConn.connect(data.url, data.token);

      setStatus('Starting camera...');
      const track = await createLocalVideoTrack({ facingMode: 'environment' });
      await roomConn.localParticipant.publishTrack(track);

      setStatus(`Publishing ✓ Room: ${data.room}`);
      setIsConnected(true);
      setRoom(roomConn);
    } catch (e: any) {
      console.error(e);
      setStatus(`LiveKit connect failed: ${e?.message || String(e)}`);
    }
  };

  const handleStop = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setIsConnected(false);
      setStatus('Disconnected');
    }
  };

  return (
    <div className="relative min-h-screen">
      <CircuitBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-12">
        <header className="flex items-center justify-between mb-8">
          <CircuitButton 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </CircuitButton>
        </header>

        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-6">
            <Camera className="w-4 h-4 inline-block mr-2" />
            Phone Camera Publisher
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border p-8 rounded-lg">
            <div className="mb-6">
              <CircuitButton 
                onClick={isConnected ? handleStop : handleStart}
                disabled={!isConnected && status.includes('Getting') || status.includes('Connecting') || status.includes('Starting')}
                size="lg"
              >
                {isConnected ? 'Stop Camera' : 'Start Camera'}
              </CircuitButton>
            </div>

            <p className="font-mono text-sm text-muted-foreground mb-4">
              Status: <span className="text-primary">{status}</span>
            </p>

            {isConnected && (
              <div className="mt-6 p-4 bg-circuit-green/10 border border-circuit-green/30 rounded">
                <p className="font-mono text-xs text-circuit-green">
                  ✓ Camera is streaming to laptop
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneCamera;
