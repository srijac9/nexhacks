import { useNavigate } from 'react-router-dom';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';
import { ArrowLeft, Camera, Video } from 'lucide-react';

const Portfolio = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      <CircuitBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <CircuitButton 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </CircuitButton>
          
          <nav className="flex items-center gap-4">
            <CircuitButton variant="ghost" size="sm">Projects</CircuitButton>
            <CircuitButton variant="ghost" size="sm">About</CircuitButton>
            <CircuitButton variant="ghost" size="sm">Contact</CircuitButton>
          </nav>
        </header>
        
        {/* Hero section */}
        <section className="text-center mb-20">
          <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-6">
            <span className="text-secondary">&lt;</span> Portfolio <span className="text-secondary">/&gt;</span>
          </div>
          
          <h1 className="font-display text-4xl md:text-6xl font-bold mb-6 circuit-text">
            PROJECTS<span className="text-secondary">_</span>
          </h1>
          
          <p className="font-mono text-muted-foreground max-w-2xl mx-auto">
            A collection of electronic dreams turned into digital reality. 
            Each project represents a node in the ever-expanding circuit of innovation.
          </p>
        </section>
        
        {/* Camera Section */}
        <section className="border-t border-b border-border py-12 mb-20">
          <div className="text-center mb-8">
            <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-4">
              <Camera className="w-4 h-4 inline-block mr-2" />
              Camera Capture System
            </div>
            <p className="font-mono text-sm text-muted-foreground mb-6">
              Real-time video streaming between phone and laptop with automatic image capture
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <CircuitButton 
                onClick={() => navigate('/phone')}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Camera className="w-4 h-4 mr-2" />
                Phone View
              </CircuitButton>
              <CircuitButton 
                onClick={() => navigate('/laptop')}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Video className="w-4 h-4 mr-2" />
                Laptop View
              </CircuitButton>
            </div>
          </div>
        </section>
        
        {/* Stats section */}
        <section className="border-t border-b border-border py-12 mb-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '24+', label: 'Projects Completed' },
              { value: '99%', label: 'Uptime Guaranteed' },
              { value: '∞', label: 'Lines of Code' },
              { value: '0', label: 'Bugs in Production' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-3xl md:text-4xl text-primary circuit-text mb-2">
                  {stat.value}
                </p>
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>
        
        {/* Contact CTA */}
        <section className="text-center">
          <p className="font-mono text-muted-foreground mb-6">
            Ready to connect your next project to the grid?
          </p>
          <CircuitButton size="lg" variant="secondary">
            Initiate Contact Protocol
          </CircuitButton>
        </section>
        
        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-border text-center">
          <p className="font-mono text-xs text-muted-foreground">
            <span className="text-primary">&copy;</span> 2024 CIRCUIT_DEV 
            <span className="text-secondary mx-2">|</span> 
            All systems operational
            <span className="animate-pulse ml-1">_</span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Portfolio;
