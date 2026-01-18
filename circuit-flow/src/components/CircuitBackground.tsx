const CircuitBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: -1 }}>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background/90" />
      
      {/* Animated scan line */}
      <div 
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        style={{
          animation: 'scan-line 8s linear infinite',
          boxShadow: '0 0 20px 2px hsl(var(--primary) / 0.3)',
        }}
      />
      
      {/* Corner circuit decorations */}
      <svg className="absolute top-0 left-0 w-64 h-64 opacity-20" viewBox="0 0 256 256">
        <path
          d="M0 128 L64 128 L64 64 L128 64 L128 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
        />
        <circle cx="64" cy="128" r="4" className="fill-primary" />
        <circle cx="64" cy="64" r="4" className="fill-primary" />
        <circle cx="128" cy="64" r="4" className="fill-primary" />
      </svg>
      
      <svg className="absolute top-0 right-0 w-64 h-64 opacity-20 rotate-90" viewBox="0 0 256 256">
        <path
          d="M0 128 L64 128 L64 64 L128 64 L128 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-secondary"
        />
        <circle cx="64" cy="128" r="4" className="fill-secondary" />
        <circle cx="64" cy="64" r="4" className="fill-secondary" />
        <circle cx="128" cy="64" r="4" className="fill-secondary" />
      </svg>
      
      <svg className="absolute bottom-0 left-0 w-64 h-64 opacity-20 -rotate-90" viewBox="0 0 256 256">
        <path
          d="M0 128 L64 128 L64 64 L128 64 L128 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
        />
        <circle cx="64" cy="128" r="4" className="fill-primary" />
        <circle cx="64" cy="64" r="4" className="fill-primary" />
        <circle cx="128" cy="64" r="4" className="fill-primary" />
      </svg>
      
      <svg className="absolute bottom-0 right-0 w-64 h-64 opacity-20 rotate-180" viewBox="0 0 256 256">
        <path
          d="M0 128 L64 128 L64 64 L128 64 L128 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-secondary"
        />
        <circle cx="64" cy="128" r="4" className="fill-secondary" />
        <circle cx="64" cy="64" r="4" className="fill-secondary" />
        <circle cx="128" cy="64" r="4" className="fill-secondary" />
      </svg>
      
      {/* Vignette effect */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, transparent 0%, hsl(var(--background)) 70%)',
        }}
      />
    </div>
  );
};

export default CircuitBackground;
