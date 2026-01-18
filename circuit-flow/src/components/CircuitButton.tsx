import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CircuitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const CircuitButton = forwardRef<HTMLButtonElement, CircuitButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = `
      relative font-display font-bold uppercase tracking-wider
      transition-all duration-300 ease-out
      border-2 overflow-hidden
      before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-primary/20 before:to-transparent
      before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700
      after:absolute after:inset-0 after:border after:border-primary/30 after:rounded-sm
      disabled:opacity-50 disabled:pointer-events-none
    `;

    const variants = {
      primary: `
        bg-background border-primary text-primary
        hover:bg-primary hover:text-primary-foreground
        hover:shadow-[0_0_30px_rgba(0,255,136,0.5),inset_0_0_20px_rgba(0,255,136,0.1)]
        active:shadow-[0_0_50px_rgba(0,255,136,0.7)]
      `,
      secondary: `
        bg-background border-secondary text-secondary
        hover:bg-secondary hover:text-secondary-foreground
        hover:shadow-[0_0_30px_rgba(0,229,255,0.5),inset_0_0_20px_rgba(0,229,255,0.1)]
        active:shadow-[0_0_50px_rgba(0,229,255,0.7)]
      `,
      ghost: `
        bg-transparent border-transparent text-primary
        hover:border-primary/50 hover:bg-primary/10
        hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]
      `,
    };

    const sizes = {
      sm: 'px-4 py-2 text-xs',
      md: 'px-6 py-3 text-sm',
      lg: 'px-10 py-4 text-base',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {/* Corner decorations */}
        <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-inherit" />
        <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-inherit" />
        <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-inherit" />
        <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-inherit" />
        
        <span className="relative z-10">{children}</span>
      </button>
    );
  }
);

CircuitButton.displayName = 'CircuitButton';

export default CircuitButton;
