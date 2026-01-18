import { useNavigate } from 'react-router-dom';
import { Suspense } from 'react';
import SnakeGame3D from '@/components/SnakeGame3D';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background layers */}
      <CircuitBackground />
      
      {/* Interactive 3D snake game */}
      <Suspense fallback={
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-circuit-green font-mono animate-pulse">Loading 3D Environment...</div>
        </div>
      }>
        <SnakeGame3D />
      </Suspense>
      
      {/* Main content - centered and above the game */}
      <div className="relative z-10 text-center px-4 pointer-events-none">
        {/* Glowing frame around content */}
        <div className="relative p-8 md:p-12">
          {/* Decorative circuit lines */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
          
          {/* Title */}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-black tracking-wider mb-4 circuit-text animate-pulse-glow">
            CIRCUIT<span className="text-secondary">_</span>DEV
          </h1>
          
          {/* Subtitle */}
          <p className="font-mono text-lg md:text-xl text-muted-foreground mb-2">
            <span className="text-primary">&gt;</span> Building the future, one connection at a time
          </p>
          
          {/* Blinking cursor effect */}
          <p className="font-mono text-sm text-muted-foreground mb-8">
            <span className="text-secondary">$</span> Arrow keys to move • Drag to rotate board 360°
            <span className="animate-pulse ml-1">_</span>
          </p>
          
          {/* Start button */}
          <div className="pointer-events-auto inline-block">
            <CircuitButton 
              size="lg" 
              onClick={() => {
                console.log('Initialize System clicked, navigating to /upload');
                navigate('/upload');
              }}
              className="mt-4"
            >
              Initialize System
            </CircuitButton>
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center justify-center gap-6 mt-8 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-circuit-green animate-pulse-glow" />
              <span>SYSTEM ACTIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-circuit-amber animate-pulse-glow" />
              <span>COLLECTING DATA</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom instruction */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="font-mono text-xs text-muted-foreground opacity-50">
          [ ↑↓←→ to move snake • Drag to rotate board • Collect components on both sides ]
        </p>
      </div>
    </div>
  );
};

export default Index;
