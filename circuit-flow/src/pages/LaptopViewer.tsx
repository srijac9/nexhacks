import { useState, useEffect, useRef } from 'react';
import { Room, type Track } from 'livekit-client';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';
import { ArrowLeft, Video, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SNAP_EVERY_MS = 30 * 1000; // 30 seconds

const LaptopViewer = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Idle');
  const [room, setRoom] = useState<Room | null>(null);
  const [attachedVideoEl, setAttachedVideoEl] = useState<HTMLVideoElement | null>(null);
  const [timerStarted, setTimerStarted] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  const getToken = async (identity: string) => {
    const response = await fetch(`/token?identity=${encodeURIComponent(identity)}&t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Token fetch failed: ${response.status}`);
    }
    return response.json();
  };

  const attachTrack = (track: Track) => {
    const videoElement = track.attach();
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.className = 'w-full max-w-4xl rounded-lg bg-card border border-border';

    if (videoRef.current) {
      videoRef.current.innerHTML = '';
      videoRef.current.appendChild(videoElement);
    }

    setAttachedVideoEl(videoElement);

    track.on('unmuted', () => {
      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.muted = true;
      el.className = 'w-full max-w-4xl rounded-lg bg-card border border-border';
      if (videoRef.current) {
        videoRef.current.innerHTML = '';
        videoRef.current.appendChild(el);
      }
      setAttachedVideoEl(el);
    });
  };

  const snapAndUpload = async () => {
    if (!attachedVideoEl || !attachedVideoEl.videoWidth || !attachedVideoEl.videoHeight) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = attachedVideoEl.videoWidth;
    canvas.height = attachedVideoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(attachedVideoEl, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    
    if (!blob) return;

    const fd = new FormData();
    fd.append('photo', blob, 'circuit.jpg');

    try {
      const response = await fetch('/upload', { method: 'POST', body: fd });
      if (response.ok) {
        setStatus(`Saved image @ ${new Date().toLocaleTimeString()}`);
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
  };

  const handleConnect = async () => {
    try {
      setStatus('Getting token...');
      const data = await getToken('laptop');

      setStatus('Connecting to LiveKit...');
      const roomConn = new Room({ adaptiveStream: false, dynacast: false });
      await roomConn.connect(data.url, data.token);

      setStatus('Waiting for phone video...');

      roomConn.on('trackSubscribed', (track) => {
        if (track.kind === 'video') {
          attachTrack(track);
          setStatus('Video connected ✓');

          if (!timerStarted) {
            setTimerStarted(true);
            const intervalId = setInterval(snapAndUpload, SNAP_EVERY_MS);
            return () => clearInterval(intervalId);
          }
        }
      });

      setRoom(roomConn);
    } catch (e: any) {
      console.error(e);
      setStatus(`Connect failed: ${e.message}`);
    }
  };

  const handleDisconnect = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setTimerStarted(false);
      if (videoRef.current) {
        videoRef.current.innerHTML = '';
      }
      setAttachedVideoEl(null);
      setStatus('Disconnected');
    }
  };

  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

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

        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-4">
              <Video className="w-4 h-4 inline-block mr-2" />
              Laptop Viewer (Auto-save every 30s)
            </div>

            <div className="mb-4">
              <CircuitButton 
                onClick={room ? handleDisconnect : handleConnect}
                size="lg"
                variant={room ? 'secondary' : 'default'}
              >
                {room ? 'Disconnect' : 'Connect'}
              </CircuitButton>
            </div>

            <p className="font-mono text-sm text-muted-foreground mb-4">
              Status: <span className="text-primary">{status}</span>
            </p>
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border p-6 rounded-lg">
            <div ref={videoRef} className="flex justify-center">
              {!attachedVideoEl && (
                <div className="w-full max-w-4xl aspect-video bg-card/30 border-2 border-dashed border-border rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground font-mono text-sm">
                    No video stream. Click Connect to receive video from phone.
                  </p>
                </div>
              )}
            </div>
          </div>

          {attachedVideoEl && (
            <div className="mt-4 p-4 bg-circuit-green/10 border border-circuit-green/30 rounded">
              <p className="font-mono text-xs text-circuit-green flex items-center gap-2">
                <Download className="w-4 h-4" />
                Auto-saving snapshots every 30 seconds to uploads/latest.jpg
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LaptopViewer;
