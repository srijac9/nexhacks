import { useEffect, useRef, useCallback, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface SnakeSegment extends Point {
  type: 'head' | 'resistor' | 'led';
  color: string;
}

interface Collectible {
  x: number;
  y: number;
  type: 'resistor' | 'led';
  color: string;
  glowIntensity: number;
  collected: boolean;
  collectTime: number;
}

const SEGMENT_SPACING = 35;
const INITIAL_SNAKE_LENGTH = 5;
const MAX_SNAKE_LENGTH = 30;
const COLLECTIBLE_COUNT = 6;
const SNAKE_SPEED = 1; // Fixed max speed in pixels per frame
const TURN_SPEED = 0.07; // How quickly the snake can turn

const SnakeGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePos = useRef<Point>({ x: 0, y: 0 });
  const snakeRef = useRef<SnakeSegment[]>([]);
  const headAngle = useRef<number>(0);
  const collectiblesRef = useRef<Collectible[]>([]);
  const animationFrameRef = useRef<number>();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const componentColors = ['#00ff88', '#00e5ff', '#ffaa00', '#ff6b6b', '#a855f7'];

  // Initialize snake
  const initSnake = useCallback((width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const snake: SnakeSegment[] = [];
    
    // Head
    snake.push({
      x: centerX,
      y: centerY,
      type: 'head',
      color: '#00e5ff',
    });
    
    // Initial body segments
    for (let i = 1; i < INITIAL_SNAKE_LENGTH; i++) {
      snake.push({
        x: centerX - i * SEGMENT_SPACING,
        y: centerY,
        type: i % 2 === 0 ? 'resistor' : 'led',
        color: componentColors[i % componentColors.length],
      });
    }
    
    snakeRef.current = snake;
    mousePos.current = { x: centerX + 100, y: centerY };
    headAngle.current = 0;
  }, []);

  // Generate random collectible
  const createCollectible = useCallback((width: number, height: number): Collectible => {
    const padding = 100;
    return {
      x: padding + Math.random() * (width - padding * 2),
      y: padding + Math.random() * (height - padding * 2),
      type: Math.random() > 0.5 ? 'resistor' : 'led',
      color: componentColors[Math.floor(Math.random() * componentColors.length)],
      glowIntensity: 0.5 + Math.random() * 0.5,
      collected: false,
      collectTime: 0,
    };
  }, []);

  // Initialize collectibles
  const initCollectibles = useCallback((width: number, height: number) => {
    const collectibles: Collectible[] = [];
    for (let i = 0; i < COLLECTIBLE_COUNT; i++) {
      collectibles.push(createCollectible(width, height));
    }
    collectiblesRef.current = collectibles;
  }, [createCollectible]);

  // Draw resistor component
  const drawResistor = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, glow: number = 1) => {
    const width = 28;
    const height = 12;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * glow;
    
    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, 3);
    ctx.fill();
    ctx.stroke();
    
    // Color bands
    const bandColors = ['#ff0000', color, '#ffff00', color];
    const bandWidth = 3;
    bandColors.forEach((bColor, i) => {
      ctx.fillStyle = bColor;
      ctx.fillRect(-width / 2 + 4 + i * 5, -height / 2 + 2, bandWidth, height - 4);
    });
    
    // Leads (wires)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-width / 2 - 8, 0);
    ctx.lineTo(-width / 2, 0);
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2 + 8, 0);
    ctx.stroke();
    
    ctx.restore();
  };

  // Draw LED component
  const drawLED = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, glow: number = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * glow;
    
    // LED dome
    const gradient = ctx.createRadialGradient(0, -2, 0, 0, 0, 10);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, color);
    gradient.addColorStop(0.7, color + 'aa');
    gradient.addColorStop(1, color + '44');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    
    // Plastic casing outline
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Bright center
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Leads
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(-4, 16);
    ctx.moveTo(4, 9);
    ctx.lineTo(4, 13);
    ctx.stroke();
    
    ctx.restore();
  };

  // Draw snake head (chip/IC style)
  const drawHead = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Glow
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 25;
    
    // IC chip body
    ctx.fillStyle = '#0a1628';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -10, 32, 20, 3);
    ctx.fill();
    ctx.stroke();
    
    // Notch at front
    ctx.beginPath();
    ctx.arc(16, 0, 4, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    
    // Pins on sides
    ctx.fillStyle = '#00e5ff';
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(-12 + i * 8, -14, 4, 4);
      ctx.fillRect(-12 + i * 8, 10, 4, 4);
    }
    
    // Center marking
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CPU', 0, 0);
    
    ctx.restore();
  };

  // Main animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const now = Date.now();

    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(10, 14, 23, 0.25)';
    ctx.fillRect(0, 0, width, height);

    const snake = snakeRef.current;
    if (snake.length > 0) {
      const head = snake[0];
      
      // Calculate direction to mouse
      const dx = mousePos.current.x - head.x;
      const dy = mousePos.current.y - head.y;
      const targetAngle = Math.atan2(dy, dx);
      
      // Smoothly turn towards target angle
      let angleDiff = targetAngle - headAngle.current;
      
      // Normalize angle difference to -PI to PI
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      // Apply turn speed limit
      if (Math.abs(angleDiff) > TURN_SPEED) {
        headAngle.current += TURN_SPEED * Math.sign(angleDiff);
      } else {
        headAngle.current = targetAngle;
      }
      
      // Move head at fixed speed
      head.x += Math.cos(headAngle.current) * SNAKE_SPEED;
      head.y += Math.sin(headAngle.current) * SNAKE_SPEED;
      
      // Wrap around screen
      if (head.x < -50) head.x = width + 50;
      if (head.x > width + 50) head.x = -50;
      if (head.y < -50) head.y = height + 50;
      if (head.y > height + 50) head.y = -50;

      // Each segment follows the one before it
      for (let i = 1; i < snake.length; i++) {
        const current = snake[i];
        const target = snake[i - 1];
        const segDx = target.x - current.x;
        const segDy = target.y - current.y;
        const distance = Math.sqrt(segDx * segDx + segDy * segDy);
        
        if (distance > SEGMENT_SPACING) {
          const ratio = (distance - SEGMENT_SPACING) / distance;
          current.x += segDx * ratio;
          current.y += segDy * ratio;
        }
      }

      // Check for collectible collisions
      collectiblesRef.current.forEach((collectible, index) => {
        if (collectible.collected) return;
        
        const cdx = head.x - collectible.x;
        const cdy = head.y - collectible.y;
        const distance = Math.sqrt(cdx * cdx + cdy * cdy);
        
        if (distance < 30) {
          collectible.collected = true;
          collectible.collectTime = now;
          
          // Add collected component to snake
          if (snake.length < MAX_SNAKE_LENGTH) {
            const tail = snake[snake.length - 1];
            const prevTail = snake[snake.length - 2] || tail;
            const tailAngle = Math.atan2(tail.y - prevTail.y, tail.x - prevTail.x);
            
            snake.push({
              x: tail.x - Math.cos(tailAngle) * SEGMENT_SPACING,
              y: tail.y - Math.sin(tailAngle) * SEGMENT_SPACING,
              type: collectible.type,
              color: collectible.color,
            });
          }
          
          // Respawn after delay
          setTimeout(() => {
            collectiblesRef.current[index] = createCollectible(width, height);
          }, 1500);
        }
      });

      // Draw connection wires between segments
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(snake[0].x, snake[0].y);
      for (let i = 1; i < snake.length; i++) {
        ctx.lineTo(snake[i].x, snake[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw each segment as its component type
      for (let i = snake.length - 1; i >= 0; i--) {
        const segment = snake[i];
        const nextSegment = snake[i - 1] || segment;
        const angle = Math.atan2(nextSegment.y - segment.y, nextSegment.x - segment.x);
        
        const pulse = Math.sin(now / 300 + i * 0.5) * 0.2 + 0.8;
        
        if (segment.type === 'head') {
          drawHead(ctx, segment.x, segment.y, headAngle.current);
        } else if (segment.type === 'resistor') {
          drawResistor(ctx, segment.x, segment.y, angle, segment.color, pulse);
        } else {
          drawLED(ctx, segment.x, segment.y, angle, segment.color, pulse);
        }
      }
    }

    // Draw collectibles
    collectiblesRef.current.forEach((collectible) => {
      if (collectible.collected) {
        // Draw collection burst effect
        const elapsed = now - collectible.collectTime;
        if (elapsed < 400) {
          const scale = 1 + elapsed / 80;
          const opacity = 1 - elapsed / 400;
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.fillStyle = collectible.color;
          ctx.shadowColor = collectible.color;
          ctx.shadowBlur = 40;
          ctx.beginPath();
          ctx.arc(collectible.x, collectible.y, 12 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        return;
      }

      const pulse = Math.sin(now / 250 + collectible.x) * 0.3 + 0.7;
      const floatY = Math.sin(now / 500 + collectible.y) * 3;

      if (collectible.type === 'resistor') {
        drawResistor(ctx, collectible.x, collectible.y + floatY, 0, collectible.color, pulse * collectible.glowIntensity);
      } else {
        drawLED(ctx, collectible.x, collectible.y + floatY, 0, collectible.color, pulse * collectible.glowIntensity);
      }
    });

    // Draw subtle grid pattern
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.02)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [createCollectible]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setDimensions({ width, height });
      
      if (canvasRef.current) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
      
      if (snakeRef.current.length === 0) {
        initSnake(width, height);
        initCollectibles(width, height);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initSnake, initCollectibles]);

  // Handle mouse movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Start animation loop
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      animate();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate, dimensions]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default SnakeGame;
