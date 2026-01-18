import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';
import { ArrowLeft, Mic, MicOff, Volume2 } from 'lucide-react';

const SchematicViewer = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'recording' | 'processing' | 'success' | 'error'>('idle');
  const [statusText, setStatusText] = useState('Ready to record');
  const [audioLevel, setAudioLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const visualizerBarsRef = useRef<HTMLDivElement>(null);
  const isManuallyStoppedRef = useRef<boolean>(false);

  // VAD parameters
  const SILENCE_THRESHOLD = 0.05; // Adjust based on background noise
  const SILENCE_DURATION = 2000; // 2 seconds in milliseconds
  const VOLUME_CHECK_INTERVAL = 100; // Check volume every 100ms

  useEffect(() => {
    // Auto-start recording when component mounts
    startRecording();

    // Cleanup on unmount
    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up Web Audio API for VAD
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      microphoneRef.current = microphone;
      dataArrayRef.current = dataArray;

      // Set up MediaRecorder for audio capture
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        (options as any).mimeType = 'audio/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped. Manual stop:', isManuallyStoppedRef.current, 'Chunks:', chunksRef.current.length);
        // Only send audio if not manually stopped
        if (!isManuallyStoppedRef.current && chunksRef.current.length > 0) {
          sendAudioToBackend();
        } else {
          console.log('Skipping send - manually stopped or no chunks');
        }
      };

      // Start recording
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      isManuallyStoppedRef.current = false; // Reset manual stop flag
      setStatus('recording');
      setStatusText('Recording... Speak now');

      // Start monitoring audio levels for VAD
      monitorAudioLevel();

    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      setStatus('error');
      setStatusText(`Error: ${error.message}`);
    }
  };

  const monitorAudioLevel = () => {
    if (!mediaRecorderRef.current || !analyserRef.current || !dataArrayRef.current) {
      return;
    }

    if (mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    const dataArray = dataArrayRef.current;
    if (!dataArray) return;
    analyserRef.current.getByteFrequencyData(dataArray as any);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i];
    }
    const average = sum / dataArrayRef.current.length;
    const volume = average / 255; // Normalize to 0-1

    // Update visualizer
    updateVisualizer(dataArrayRef.current);

    // Update audio level display
    setAudioLevel(Math.round(volume * 100));

    // Check if volume is above threshold (person is speaking)
    if (volume > SILENCE_THRESHOLD) {
      // Person is speaking, reset silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        setStatus('recording');
        setStatusText('Recording... Speak now');
      }
    } else {
      // Silence detected, start/continue timer
      if (!silenceTimerRef.current && mediaRecorderRef.current?.state === 'recording') {
        setStatus('listening');
        setStatusText('Listening... (silence detected)');
        silenceTimerRef.current = setTimeout(() => {
          // 2 seconds of silence - send audio
          handleSilenceDetected();
        }, SILENCE_DURATION);
      }
    }

    // Continue monitoring if still recording
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
    }
  };

  const handleSilenceDetected = () => {
    // Check if recording is still active using ref/state check
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.log('Recording already stopped, skipping silence detection');
      return;
    }

    console.log('Silence detected, stopping recorder. Chunks:', chunksRef.current.length);
    setStatus('processing');
    setStatusText('Silence detected. Sending audio...');

    // Stop current recording chunk
    if (mediaRecorderRef.current && 
        (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      mediaRecorderRef.current.stop();
    }

    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const updateVisualizer = (dataArray: Uint8Array) => {
    if (!visualizerBarsRef.current) return;

    const bars = visualizerBarsRef.current.children;
    const barCount = bars.length;
    const step = Math.floor(dataArray.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const bar = bars[i] as HTMLElement;
      const index = i * step;
      const value = dataArray[index] || 0;
      const height = (value / 255) * 100;
      bar.style.height = `${Math.max(height, 2)}%`;
    }
  };

  const sendAudioToBackend = async () => {
    console.log('sendAudioToBackend called, chunks:', chunksRef.current.length);
    
    if (chunksRef.current.length === 0) {
      console.log('No audio data to send, resuming recording');
      resumeRecording();
      return;
    }

    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      console.log('Sending audio blob, size:', blob.size, 'bytes');
      const formData = new FormData();
      formData.append('audio', blob, `recording_${Date.now()}.webm`);

      console.log('Sending POST request to http://localhost:8001/upload-audio');
      const response = await fetch('http://localhost:8001/upload-audio', {
        method: 'POST',
        body: formData
      });
      
      console.log('Response status:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        setChunkCount(prev => prev + 1);
        setStatus('success');
        setStatusText(`Audio sent successfully! (${chunkCount + 1} chunks)`);

        console.log('Audio sent successfully:', result);

        // Resume recording after a brief delay
        setTimeout(() => {
          if (isRecording) {
            resumeRecording();
          }
        }, 500);
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    } catch (error: any) {
      console.error('Error sending audio:', error);
      setStatus('error');
      setStatusText(`Error sending audio: ${error.message}`);

      // Resume recording even on error
      setTimeout(() => {
        if (isRecording) {
          resumeRecording();
        }
      }, 1000);
    }
  };

  const resumeRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    // Clear previous chunks
    chunksRef.current = [];

    // Restart MediaRecorder
    if (mediaRecorderRef.current.state === 'inactive') {
      mediaRecorderRef.current.start();
      setStatus('recording');
      setStatusText('Recording... Speak now');
      // Resume monitoring
      monitorAudioLevel();
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    isManuallyStoppedRef.current = true; // Mark as manually stopped

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Clear chunks before stopping to prevent sending audio when manually stopped
    chunksRef.current = [];

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    // Stop all tracks
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    setStatus('idle');
    setStatusText('Recording stopped');
    setAudioLevel(0);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'recording':
        return 'bg-circuit-green/10 border-circuit-green/30 text-circuit-green';
      case 'listening':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-500';
      case 'processing':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-500';
      case 'success':
        return 'bg-circuit-green/10 border-circuit-green/30 text-circuit-green';
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-500';
      default:
        return 'bg-card/50 border-border text-muted-foreground';
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
            onClick={() => navigate('/upload')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </CircuitButton>
        </header>

        <div className="max-w-5xl mx-auto">
          {/* Hero section */}
          <section className="text-center mb-12">
            <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-6">
              <Mic className="w-4 h-4 inline-block mr-2" />
              Voice Input
            </div>

            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6 circuit-text">
              SCHEMATIC<span className="text-secondary">_</span>VIEWER
            </h1>

            <p className="font-mono text-muted-foreground max-w-2xl mx-auto">
              Speak naturally. Audio will be sent automatically when you pause for 2 seconds.
            </p>
          </section>

          {/* Status display */}
          <div className={`p-4 rounded-lg border font-mono text-sm mb-6 ${getStatusColor()}`}>
            <div className="flex items-center gap-2">
              {status === 'recording' && <Mic className="w-4 h-4 animate-pulse" />}
              {status === 'listening' && <Volume2 className="w-4 h-4" />}
              {status === 'processing' && <MicOff className="w-4 h-4" />}
              <span>{statusText}</span>
            </div>
          </div>

          {/* Audio visualizer */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-lg p-8 mb-6">
            <div className="h-32 bg-card/30 rounded-lg flex items-end justify-center gap-1 p-4" ref={visualizerBarsRef}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary rounded-sm transition-all duration-75"
                  style={{ height: '2%' }}
                />
              ))}
            </div>
          </div>

          {/* Info section */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Audio Level:</span>{' '}
                <span className="text-primary">{audioLevel}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Chunks Sent:</span>{' '}
                <span className="text-primary">{chunkCount}</span>
              </div>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex gap-4 justify-center">
            {isRecording ? (
              <CircuitButton
                onClick={stopRecording}
                variant="secondary"
                size="lg"
              >
                <MicOff className="w-5 h-5 mr-2" />
                Stop Recording
              </CircuitButton>
            ) : (
              <CircuitButton
                onClick={startRecording}
                size="lg"
              >
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </CircuitButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchematicViewer;
