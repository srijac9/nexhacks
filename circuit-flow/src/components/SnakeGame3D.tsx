import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Grid settings
const GRID_SIZE = 20;
const CELL_SIZE = 0.4;
const BOARD_HEIGHT = 0.2;

// Component spawn tuning
const COLLECTIBLES_PER_SIDE = 10;
const RESPAWNS_PER_COLLECT = 2;

// Component types
type ComponentType = 'resistor' | 'led' | 'capacitor';
type Direction = 'up' | 'down' | 'left' | 'right';
type BoardSide = 'top' | 'bottom';

interface Position {
  x: number;
  z: number;
}

interface SnakeSegment {
  position: Position;
  componentType: ComponentType;
}

interface Collectible {
  position: Position;
  type: ComponentType;
  side: BoardSide;
}

// 3D Breadboard component - Single white dual-sided board
function Breadboard() {
  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow castShadow>
        <boxGeometry args={[GRID_SIZE * CELL_SIZE + 0.8, BOARD_HEIGHT, GRID_SIZE * CELL_SIZE + 0.8]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>

      <mesh position={[0, BOARD_HEIGHT / 2 + 0.02, 0]}>
        <boxGeometry args={[GRID_SIZE * CELL_SIZE + 0.6, 0.04, 0.12]} />
        <meshStandardMaterial color="#d8d8d0" />
      </mesh>

      <mesh position={[0, -BOARD_HEIGHT / 2 - 0.02, 0]}>
        <boxGeometry args={[GRID_SIZE * CELL_SIZE + 0.6, 0.04, 0.12]} />
        <meshStandardMaterial color="#d8d8d0" />
      </mesh>

      {/* Grid holes - top */}
      {Array.from({ length: GRID_SIZE }).map((_, x) =>
        Array.from({ length: GRID_SIZE }).map((_, z) => (
          <mesh
            key={`hole-top-${x}-${z}`}
            position={[
              (x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
              BOARD_HEIGHT / 2 + 0.005,
              (z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
            ]}
          >
            <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))
      )}

      {/* Grid holes - bottom */}
      {Array.from({ length: GRID_SIZE }).map((_, x) =>
        Array.from({ length: GRID_SIZE }).map((_, z) => (
          <mesh
            key={`hole-bottom-${x}-${z}`}
            position={[
              (x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
              -BOARD_HEIGHT / 2 - 0.005,
              (z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
            ]}
          >
            <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))
      )}

      {/* Power rails - top */}
      <mesh position={[-(GRID_SIZE * CELL_SIZE) / 2 - 0.25, BOARD_HEIGHT / 2 + 0.015, 0]}>
        <boxGeometry args={[0.08, 0.03, GRID_SIZE * CELL_SIZE + 0.5]} />
        <meshStandardMaterial color="#cc3333" emissive="#ff0000" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[(GRID_SIZE * CELL_SIZE) / 2 + 0.25, BOARD_HEIGHT / 2 + 0.015, 0]}>
        <boxGeometry args={[0.08, 0.03, GRID_SIZE * CELL_SIZE + 0.5]} />
        <meshStandardMaterial color="#3333cc" emissive="#0000ff" emissiveIntensity={0.2} />
      </mesh>

      {/* Power rails - bottom */}
      <mesh position={[-(GRID_SIZE * CELL_SIZE) / 2 - 0.25, -BOARD_HEIGHT / 2 - 0.015, 0]}>
        <boxGeometry args={[0.08, 0.03, GRID_SIZE * CELL_SIZE + 0.5]} />
        <meshStandardMaterial color="#cc3333" emissive="#ff0000" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[(GRID_SIZE * CELL_SIZE) / 2 + 0.25, -BOARD_HEIGHT / 2 - 0.015, 0]}>
        <boxGeometry args={[0.08, 0.03, GRID_SIZE * CELL_SIZE + 0.5]} />
        <meshStandardMaterial color="#3333cc" emissive="#0000ff" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function Resistor3D({ position, side }: { position: Position; side: BoardSide }) {
  const yOffset = side === 'top' ? BOARD_HEIGHT / 2 + 0.12 : -BOARD_HEIGHT / 2 - 0.12;
  const flipRotation = side === 'bottom' ? Math.PI : 0;

  const worldPos = [
    (position.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (position.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ] as const;

  return (
    <group position={worldPos} rotation={[flipRotation, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 12]} />
        <meshStandardMaterial color="#d4a574" />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.025, 12]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.025, 12]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.025, 12]} />
        <meshStandardMaterial color="#FFD700" />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function LED3D({ position, color = '#00ff88', side }: { position: Position; color?: string; side: BoardSide }) {
  const [intensity, setIntensity] = useState(0.5);

  useFrame((state) => {
    setIntensity(0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.3);
  });

  const yOffset = side === 'top' ? BOARD_HEIGHT / 2 + 0.15 : -BOARD_HEIGHT / 2 - 0.15;
  const flipRotation = side === 'bottom' ? Math.PI : 0;

  const worldPos = [
    (position.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (position.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ] as const;

  return (
    <group position={worldPos} rotation={[flipRotation, 0, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.08, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.08, 16]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[-0.02, -0.12, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.12, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.02, -0.1, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.08, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
      <pointLight color={color} intensity={intensity * 0.6} distance={1.5} />
    </group>
  );
}

function Capacitor3D({ position, side }: { position: Position; side: BoardSide }) {
  const yOffset = side === 'top' ? BOARD_HEIGHT / 2 + 0.15 : -BOARD_HEIGHT / 2 - 0.15;
  const flipRotation = side === 'bottom' ? Math.PI : 0;

  const worldPos = [
    (position.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (position.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ] as const;

  return (
    <group position={worldPos} rotation={[flipRotation, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.22, 16]} />
        <meshStandardMaterial color="#1a3a5c" metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.015, 16]} />
        <meshStandardMaterial color="#666666" />
      </mesh>
      <mesh position={[-0.03, -0.15, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.1, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.03, -0.15, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.1, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function CollectibleComponent({ collectible }: { collectible: Collectible }) {
  const groupRef = useRef<THREE.Group>(null);

  const yOffset = collectible.side === 'top' ? BOARD_HEIGHT / 2 + 0.18 : -BOARD_HEIGHT / 2 - 0.18;
  const bobDirection = collectible.side === 'top' ? 1 : -1;

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = yOffset + Math.sin(state.clock.elapsedTime * 3) * 0.04 * bobDirection;
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });

  const worldPos = [
    (collectible.position.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (collectible.position.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ] as const;

  const getColor = () => {
    switch (collectible.type) {
      case 'led': return '#00ff88';
      case 'resistor': return '#ff8800';
      case 'capacitor': return '#4488ff';
    }
  };

  return (
    <group ref={groupRef} position={worldPos}>
      {collectible.type === 'led' && (
        <>
          <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial
              color={getColor()}
              emissive={getColor()}
              emissiveIntensity={0.8}
              transparent
              opacity={0.9}
            />
          </mesh>
          <pointLight color={getColor()} intensity={1} distance={2} />
        </>
      )}
      {collectible.type === 'resistor' && (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.2, 12]} />
          <meshStandardMaterial color="#d4a574" emissive={getColor()} emissiveIntensity={0.3} />
        </mesh>
      )}
      {collectible.type === 'capacitor' && (
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, 0.2, 16]} />
          <meshStandardMaterial color="#1a3a5c" emissive={getColor()} emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}

function ICChip({ position, direction, side }: { position: Position; direction: Direction; side: BoardSide }) {
  const groupRef = useRef<THREE.Group>(null);

  const getRotation = () => {
    switch (direction) {
      case 'up': return 0;
      case 'down': return Math.PI;
      case 'left': return Math.PI / 2;
      case 'right': return -Math.PI / 2;
    }
  };

  const yOffset = side === 'top' ? BOARD_HEIGHT / 2 + 0.1 : -BOARD_HEIGHT / 2 - 0.1;
  const bobDirection = side === 'top' ? 1 : -1;
  const flipRotation = side === 'bottom' ? Math.PI : 0;

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = yOffset + Math.sin(state.clock.elapsedTime * 5) * 0.015 * bobDirection;
    }
  });

  const worldPos = [
    (position.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (position.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ] as const;

  return (
    <group ref={groupRef} position={worldPos} rotation={[flipRotation, getRotation(), 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.28, 0.08, 0.2]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.041, 0]}>
        <boxGeometry args={[0.15, 0.008, 0.06]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[-0.12, 0.041, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.015, 16]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
      {[-0.06, 0, 0.06].map((z, i) => (
        <mesh key={`left-${i}`} position={[-0.16, -0.015, z]}>
          <boxGeometry args={[0.06, 0.015, 0.015]} />
          <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {[-0.06, 0, 0.06].map((z, i) => (
        <mesh key={`right-${i}`} position={[0.16, -0.015, z]}>
          <boxGeometry args={[0.06, 0.015, 0.015]} />
          <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      <pointLight color="#00ff88" intensity={0.8} distance={1.2} />
    </group>
  );
}

function WireConnection({ from, to, side }: { from: Position; to: Position; side: BoardSide }) {
  const yOffset = side === 'top' ? BOARD_HEIGHT / 2 + 0.08 : -BOARD_HEIGHT / 2 - 0.08;

  const fromWorld = [
    (from.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (from.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ];
  const toWorld = [
    (to.x - GRID_SIZE / 2 + 0.5) * CELL_SIZE,
    yOffset,
    (to.z - GRID_SIZE / 2 + 0.5) * CELL_SIZE
  ];

  const midPoint = [(fromWorld[0] + toWorld[0]) / 2, (fromWorld[1] + toWorld[1]) / 2, (fromWorld[2] + toWorld[2]) / 2];
  const length = Math.sqrt(Math.pow(toWorld[0] - fromWorld[0], 2) + Math.pow(toWorld[2] - fromWorld[2], 2));
  if (length > CELL_SIZE * 2) return null;

  const angle = Math.atan2(toWorld[2] - fromWorld[2], toWorld[0] - fromWorld[0]);

  return (
    <mesh position={midPoint as [number, number, number]} rotation={[0, -angle + Math.PI / 2, Math.PI / 2]}>
      <cylinderGeometry args={[0.012, 0.012, length, 8]} />
      <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

function BoardController({ children, rotation }: { children: React.ReactNode; rotation: { x: number; y: number } }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, rotation.x, 0.08);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotation.y, 0.08);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

function GameScene({
  snake,
  collectibles,
  direction,
  boardRotation,
  snakeSide
}: {
  snake: SnakeSegment[];
  collectibles: Collectible[];
  direction: Direction;
  boardRotation: { x: number; y: number };
  snakeSide: BoardSide;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.7} castShadow />
      <directionalLight position={[-5, -10, -5]} intensity={0.4} />
      <pointLight position={[0, 8, 0]} intensity={0.4} color="#00ff88" />
      <pointLight position={[0, -8, 0]} intensity={0.3} color="#00ff88" />

      <BoardController rotation={boardRotation}>
        <Breadboard />

        {snake.slice(1).map((segment, index) => (
          <WireConnection key={`wire-${index}`} from={snake[index].position} to={segment.position} side={snakeSide} />
        ))}

        {snake.length > 0 && <ICChip position={snake[0].position} direction={direction} side={snakeSide} />}

        {snake.slice(1).map((segment, index) => {
          switch (segment.componentType) {
            case 'resistor':
              return <Resistor3D key={`seg-${index}`} position={segment.position} side={snakeSide} />;
            case 'led':
              return <LED3D key={`seg-${index}`} position={segment.position} side={snakeSide} />;
            case 'capacitor':
              return <Capacitor3D key={`seg-${index}`} position={segment.position} side={snakeSide} />;
          }
        })}

        {collectibles.map((collectible, index) => (
          <CollectibleComponent key={`collect-${collectible.side}-${index}`} collectible={collectible} />
        ))}
      </BoardController>
    </>
  );
}

export default function SnakeGame3D() {
  // snake[0] = head (IC chip). snake[1..] = trailing components.
  const [snake, setSnake] = useState<SnakeSegment[]>([
    { position: { x: 10, z: 10 }, componentType: 'resistor' }
  ]);

  const [direction, setDirection] = useState<Direction>('up');
  const [nextDirection, setNextDirection] = useState<Direction>('up');

  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]); // ✅ sync source of truth for collision

  const [boardRotation, setBoardRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const lastMoveTime = useRef(0);
  const moveInterval = 300;

  const [snakeSide, setSnakeSide] = useState<BoardSide>('top');

  const getRandomPosition = useCallback((): Position => {
    return { x: Math.floor(Math.random() * GRID_SIZE), z: Math.floor(Math.random() * GRID_SIZE) };
  }, []);

  const getRandomType = useCallback((): ComponentType => {
    const types: ComponentType[] = ['resistor', 'led', 'capacitor'];
    return types[Math.floor(Math.random() * types.length)];
  }, []);

  // Init collectibles (sync ref + state)
  useEffect(() => {
    const initial: Collectible[] = [];
    for (let i = 0; i < COLLECTIBLES_PER_SIDE; i++) initial.push({ position: getRandomPosition(), type: getRandomType(), side: 'top' });
    for (let i = 0; i < COLLECTIBLES_PER_SIDE; i++) initial.push({ position: getRandomPosition(), type: getRandomType(), side: 'bottom' });

    collectiblesRef.current = initial;
    setCollectibles(initial);
  }, [getRandomPosition, getRandomType]);

  // Mouse drag rotate
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;

      setBoardRotation((prev) => ({ x: prev.x + deltaY * 0.01, y: prev.y + deltaX * 0.01 }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDragging]);

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setNextDirection((prev) => (prev !== 'down' ? 'up' : prev));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setNextDirection((prev) => (prev !== 'up' ? 'down' : prev));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setNextDirection((prev) => (prev !== 'right' ? 'left' : prev));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setNextDirection((prev) => (prev !== 'left' ? 'right' : prev));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Game loop
  useEffect(() => {
    let animationId: number;

    const oppositeDir = (d: Direction): Direction => {
      switch (d) {
        case 'up': return 'down';
        case 'down': return 'up';
        case 'left': return 'right';
        case 'right': return 'left';
      }
    };

    const gameLoop = () => {
      const now = Date.now();
      if (now - lastMoveTime.current >= moveInterval) {
        lastMoveTime.current = now;

        setSnake((prevSnake) => {
          const head = prevSnake[0];
          let newX = head.position.x;
          let newZ = head.position.z;

          // intended move
          switch (nextDirection) {
            case 'up': newZ--; break;
            case 'down': newZ++; break;
            case 'left': newX--; break;
            case 'right': newX++; break;
          }

          // edge flip + bounce + keep moving
          let nextSide: BoardSide = snakeSide;

          if (newX < 0 || newX >= GRID_SIZE || newZ < 0 || newZ >= GRID_SIZE) {
            if (newX < 0) newX = 0;
            if (newX >= GRID_SIZE) newX = GRID_SIZE - 1;
            if (newZ < 0) newZ = 0;
            if (newZ >= GRID_SIZE) newZ = GRID_SIZE - 1;

            nextSide = snakeSide === 'top' ? 'bottom' : 'top';
            setSnakeSide(nextSide);

            const bounced = oppositeDir(nextDirection);
            setDirection(bounced);
            setNextDirection(bounced);

            switch (bounced) {
              case 'up': newZ--; break;
              case 'down': newZ++; break;
              case 'left': newX--; break;
              case 'right': newX++; break;
            }

            newX = Math.max(0, Math.min(GRID_SIZE - 1, newX));
            newZ = Math.max(0, Math.min(GRID_SIZE - 1, newZ));
          } else {
            setDirection(nextDirection);
          }

          // ✅ synchronous collectible collision using ref
          let collected = false;
          let collectedType: ComponentType = 'resistor';

          const current = collectiblesRef.current;
          const hitIndex = current.findIndex(
            (c) => c.side === nextSide && c.position.x === newX && c.position.z === newZ
          );

          let updatedCollectibles = current;

          if (hitIndex !== -1) {
            collected = true;
            collectedType = current[hitIndex].type;

            // remove hit
            updatedCollectibles = current.slice(0, hitIndex).concat(current.slice(hitIndex + 1));

            // respawn some on that same side to keep density
            const spawns: Collectible[] = [];
            for (let i = 0; i < RESPAWNS_PER_COLLECT; i++) {
              spawns.push({ position: getRandomPosition(), type: getRandomType(), side: nextSide });
            }
            updatedCollectibles = updatedCollectibles.concat(spawns);

            collectiblesRef.current = updatedCollectibles;
            setCollectibles(updatedCollectibles);
          }

          // ✅ trailing snake update (positions shift)
          const prevPositions = prevSnake.map((s) => s.position);
          const prevTypes = prevSnake.map((s) => s.componentType);

          if (collected) {
            // N+1 length: new head + all previous positions
            const newPositions = [{ x: newX, z: newZ }, ...prevPositions];
            // types: existing + collected type added at new tail
            const newTypes = [...prevTypes, collectedType];

            return newPositions.map((pos, i) => ({
              position: { ...pos },
              componentType: newTypes[i]
            }));
          } else {
            // same length: new head + previous positions except last
            const newPositions = [{ x: newX, z: newZ }, ...prevPositions.slice(0, -1)];
            return newPositions.map((pos, i) => ({
              position: { ...pos },
              componentType: prevTypes[i]
            }));
          }
        });
      }

      animationId = requestAnimationFrame(gameLoop);
      return;
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [nextDirection, snakeSide, getRandomPosition, getRandomType]);

  // --- Scroll "focus" (NEW) ---
  // 0 at top screen, 1 after you scroll ~1 viewport down
  const [scrollT, setScrollT] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = window.innerHeight || 1;
      const t = Math.min(1, Math.max(0, window.scrollY / h));
      setScrollT(t);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const titleOpacity = 0.05 + scrollT * 0.95;            // fade in
  const titleScale = 0.96 + scrollT * 0.04;              // subtle "focus" zoom
  const titleBlurPx = Math.round((1 - scrollT) * 10);    // starts blurry -> crisp
  const dimOverlayOpacity = 0.0 + scrollT * 0.35;        // dims board behind title

  return (
    <div className="relative w-full" style={{ minHeight: '200vh' }}>
      {/* Canvas stays perfectly centered and behind everything */}
      <div className="fixed inset-0 w-full h-full">
        <Canvas shadows camera={{ position: [0, 10, 10], fov: 50 }} style={{ background: 'transparent' }}>
          <fog attach="fog" args={['#0a0a0f', 12, 35]} />
          <GameScene
            snake={snake}
            collectibles={collectibles}
            direction={direction}
            boardRotation={boardRotation}
            snakeSide={snakeSide}
          />
        </Canvas>

        {/* Optional dimmer so text reads better when you scroll */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `rgba(0,0,0,${dimOverlayOpacity})`,
            transition: 'background 120ms ease-out'
          }}
        />
      </div>

      {/* HUD stays in the same places; doesn't affect centering */}
      <div className="fixed bottom-4 left-4 text-circuit-green/60 text-sm font-mono pointer-events-none">
        <p>↑↓←→ Move Snake</p>
        <p>🖱️ Drag to rotate board 360°</p>
      </div>

      <div className="fixed top-4 right-4 text-circuit-green font-mono pointer-events-none">
        <p className="text-lg">Components: {snake.length - 1}</p>
        <p className="text-sm opacity-70">Snake on: {snakeSide.toUpperCase()} side</p>
      </div>

      {/* Scroll content layer (transparent, centered) */}
      <div className="relative z-10">
        {/* First screen: keeps the board as the main focus */}
        <section className="h-screen w-full" />

        {/* Second screen: title comes into focus while board remains centered behind it */}
        <section className="h-screen w-full flex items-center justify-center px-6">
          <div
            className="max-w-3xl text-center select-none"
            style={{
              opacity: titleOpacity,
              transform: `scale(${titleScale}) translateY(${(1 - scrollT) * 16}px)`,
              filter: `blur(${titleBlurPx}px)`,
              transition: 'opacity 140ms ease-out, transform 140ms ease-out, filter 140ms ease-out',
              pointerEvents: 'none' // keeps drag-to-rotate working even over the text
            }}
          >
            <h1 className="text-4xl md:text-6xl font-semibold text-circuit-green font-mono">
              Circuit Snake: Breadboard Builder
            </h1>
            <p className="mt-4 text-circuit-green/70 font-mono leading-relaxed">
              Scroll down to bring the title into focus while the breadboard stays centered behind it.
              The game stays live the whole time.
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-circuit-green/70 font-mono text-sm">
                Tip: Arrow keys move. Mouse drag rotates. Keep collecting components.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}