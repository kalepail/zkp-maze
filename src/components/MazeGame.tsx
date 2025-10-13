import { useState, useEffect, useCallback, useRef } from 'react';
import mazeConfig from '../maze_seed.json';
import { MazeGenerator } from '../utils/mazeGenerator';
import { NORTH, EAST, SOUTH, WEST } from '../constants/maze';
import { ANIMATION } from '../constants/theme';
import { useGameState } from '../hooks/useGameState';
import { useMazeProof } from '../hooks/useMazeProof';
import { useMazeProofCircomGroth16 } from '../hooks/useMazeProofCircomGroth16';
import { useMazeProofCircomPlonk } from '../hooks/useMazeProofCircomPlonk';
import { useSwipeControls } from '../hooks/useSwipeControls';
import type { ProofSystemType } from '../types/proofSystem';
import { DEFAULT_PROOF_SYSTEM } from '../types/proofSystem';
import MazeCanvas from './MazeCanvas';
import GameControls from './GameControls';
import StatsPanel from './StatsPanel';
import LogsPanel from './LogsPanel';
import ProofPanel from './ProofPanel';
import MobileControls from './MobileControls';
import ProofSystemInfo from './ProofSystemInfo';

export default function MazeGame() {
  const [initialMaze, setInitialMaze] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);
  const [useLocalProof, setUseLocalProof] = useState(true);
  const [proofSystem, setProofSystem] = useState<ProofSystemType>(DEFAULT_PROOF_SYSTEM);
  const [logs, setLogs] = useState<string[]>([]);
  const [proof, setProof] = useState('');
  const warmupInitiatedRef = useRef(false);

  // Shared log management
  const addLog = useCallback((content: string) => {
    setLogs((prev) => [...prev, content]);
  }, []);

  // Shared proof management
  const clearProof = useCallback(() => {
    setProof('');
  }, []);

  // Initialize maze
  useEffect(() => {
    const generator = new MazeGenerator(
      mazeConfig.rows,
      mazeConfig.cols,
      mazeConfig.seed
    );
    generator.generate();
    const grid = generator.toBinaryGrid();
    setInitialMaze(grid);
    setLoading(false);
  }, []);

  const gameState = useGameState(initialMaze);

  // Initialize all proof hooks unconditionally (React rules)
  const noirLocalHook = useMazeProof('local', mazeConfig.seed, addLog, setProof);
  const noirServerHook = useMazeProof('server', mazeConfig.seed, addLog, setProof);
  const groth16Hook = useMazeProofCircomGroth16(mazeConfig.seed, addLog, setProof);
  const plonkHook = useMazeProofCircomPlonk(mazeConfig.seed, addLog, setProof);

  // Select active proof hook based on mode and system
  const proofHook = useLocalProof
    ? (proofSystem === 'noir-ultrahonk'
        ? noirLocalHook
        : proofSystem === 'circom-groth16'
          ? groth16Hook
          : plonkHook)
    : noirServerHook;

  // Warmup container when switching to server mode
  useEffect(() => {
    if (!useLocalProof && !warmupInitiatedRef.current) {
      warmupInitiatedRef.current = true;
      noirServerHook.warmupContainer();
    }
    // Reset the ref when switching back to local mode
    if (useLocalProof) {
      warmupInitiatedRef.current = false;
    }
  }, [useLocalProof, noirServerHook]);

  // Auto-load Circom artifacts when switching to them (local mode only)
  useEffect(() => {
    if (!useLocalProof) return; // Only for local mode

    if (proofSystem === 'circom-groth16' && 'loadArtifacts' in groth16Hook) {
      groth16Hook.loadArtifacts();
    } else if (proofSystem === 'circom-plonk' && 'loadArtifacts' in plonkHook) {
      plonkHook.loadArtifacts();
    }
  }, [proofSystem, useLocalProof, groth16Hook, plonkHook]);

  // Handle proof mode and system changes
  const handleUseLocalProofChange = useCallback((useLocal: boolean) => {
    setUseLocalProof(useLocal);
  }, []);

  const handleProofSystemChange = useCallback((system: ProofSystemType) => {
    setProofSystem(system);
  }, []);

  const {
    maze,
    playerPos,
    startPos,
    endPos,
    currentDir,
    moves,
    playerPath,
    won,
    autoSolving,
    elapsedTime,
    setPlayerPos,
    setCurrentDir,
    setMoves,
    setPlayerPath,
    setWon,
    setAutoSolving,
    handleMove,
    reset,
  } = gameState;

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, number> = {
        ArrowUp: NORTH,
        ArrowDown: SOUTH,
        ArrowLeft: WEST,
        ArrowRight: EAST,
        w: NORTH,
        W: NORTH,
        s: SOUTH,
        S: SOUTH,
        a: WEST,
        A: WEST,
        d: EAST,
        D: EAST,
      };

      if (keyMap[e.key] !== undefined) {
        e.preventDefault();
        handleMove(keyMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove]);

  // Swipe controls for mobile
  useSwipeControls({
    onSwipe: handleMove,
    enabled: !won && !autoSolving,
  });

  // Add initial log when maze is loaded
  useEffect(() => {
    if (!loading) {
      addLog(`🎮 Maze generated from seed ${mazeConfig.seed}! Use arrow keys to navigate.`);
    }
  }, [loading, addLog]);

  // Add victory log
  useEffect(() => {
    if (won) {
      addLog('🎉 You solved the maze! Click "Generate Proof" to verify.');
    }
  }, [won, addLog]);

  // BFS pathfinding to solve the maze
  const findPath = useCallback((): [number, number][] | null => {
    const queue: Array<{ pos: [number, number]; path: [number, number][] }> = [];
    const visited = new Set<string>();
    const start = playerPos;
    const end = endPos;

    queue.push({ pos: start, path: [start] });
    visited.add(`${start[0]},${start[1]}`);

    while (queue.length > 0) {
      const { pos, path } = queue.shift()!;
      const [row, col] = pos;

      if (row === end[0] && col === end[1]) {
        return path;
      }

      const directions: Array<[number, number]> = [
        [-1, 0], // NORTH
        [0, 1],  // EAST
        [1, 0],  // SOUTH
        [0, -1], // WEST
      ];

      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const key = `${newRow},${newCol}`;

        if (
          newRow >= 0 &&
          newRow < maze.length &&
          newCol >= 0 &&
          newCol < maze[0].length &&
          maze[newRow][newCol] === 1 &&
          !visited.has(key)
        ) {
          visited.add(key);
          queue.push({
            pos: [newRow, newCol],
            path: [...path, [newRow, newCol]],
          });
        }
      }
    }

    return null;
  }, [playerPos, endPos, maze]);

  const autoSolve = useCallback(async () => {
    if (won || proofHook.proving || autoSolving) return;

    setAutoSolving(true);
    addLog('🤖 Auto-solving maze...');

    const path = findPath();
    if (!path) {
      addLog('❌ No solution found!');
      setAutoSolving(false);
      return;
    }

    addLog(`🗺️ Found path with ${path.length - 1} steps`);

    // Convert path to direction moves
    const pathMoves: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const dr = curr[0] - prev[0];
      const dc = curr[1] - prev[1];

      if (dr === -1) pathMoves.push(NORTH);
      else if (dr === 1) pathMoves.push(SOUTH);
      else if (dc === 1) pathMoves.push(EAST);
      else pathMoves.push(WEST);
    }

    // Animate the solution
    let moveIndex = 0;
    const animateMove = () => {
      if (moveIndex >= pathMoves.length) {
        setWon(true);
        setAutoSolving(false);
        return;
      }

      const direction = pathMoves[moveIndex];
      setCurrentDir(direction);

      const offsets: Record<number, [number, number]> = {
        [NORTH]: [-1, 0],
        [SOUTH]: [1, 0],
        [EAST]: [0, 1],
        [WEST]: [0, -1],
      };

      const [dr, dc] = offsets[direction];
      setPlayerPos((pos) => {
        const newPos: [number, number] = [pos[0] + dr, pos[1] + dc];
        setPlayerPath((prev) => [...prev, newPos]);
        return newPos;
      });

      setMoves((prev) => [...prev, direction]);

      moveIndex++;
      setTimeout(animateMove, ANIMATION.autoSolveDelay);
    };

    animateMove();
  }, [
    won,
    proofHook.proving,
    autoSolving,
    findPath,
    setAutoSolving,
    setCurrentDir,
    setPlayerPos,
    setPlayerPath,
    setMoves,
    setWon,
    addLog,
  ]);

  const handleGenerateProof = useCallback(() => {
    if (won) {
      proofHook.generateProof(moves);
    }
  }, [won, moves, proofHook]);

  const handleReset = useCallback(() => {
    reset();
    clearProof();
    addLog(`🎮 Maze reset to seed ${mazeConfig.seed}! Use arrow keys to navigate.`);
  }, [reset, clearProof, addLog]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#c0c0c0] flex items-center justify-center">
        <div className="bg-white border-2 border-black p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="font-mono text-sm">Loading maze...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#c0c0c0] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {/* Title Bar */}
          <div className="bg-black text-white px-4 py-2 font-mono text-sm flex items-center justify-between">
            <span>🧩 Noir Maze Challenge</span>
            <div className="flex gap-2">
              <div className="w-4 h-4 border border-white"></div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 md:p-6">
            {/* Stats Panel */}
            <StatsPanel
              mazeSeed={mazeConfig.seed}
              currentDir={currentDir}
              moveCount={moves.length}
              elapsedTime={elapsedTime}
            />

            {/* Game Controls */}
            <GameControls
              won={won}
              proving={proofHook.proving}
              autoSolving={autoSolving}
              useLocalProof={useLocalProof}
              proofSystem={proofSystem}
              onUseLocalProofChange={handleUseLocalProofChange}
              onProofSystemChange={handleProofSystemChange}
              onGenerateProof={handleGenerateProof}
              onAutoSolve={autoSolve}
              onReset={handleReset}
            />

            {/* Proof System Info - only show when local mode is enabled */}
            {useLocalProof && <ProofSystemInfo />}

            {/* Mobile Touch Controls */}
            <MobileControls
              onMove={handleMove}
              disabled={won || autoSolving || proofHook.proving}
            />

            <div className="grid md:grid-cols-2 md:grid-rows-2 gap-4 mt-4 md:max-h-[600px]">
              {/* Maze Canvas - spans both rows */}
              <div className="md:row-span-2">
                <MazeCanvas
                  maze={maze}
                  playerPos={playerPos}
                  startPos={startPos}
                  endPos={endPos}
                  currentDir={currentDir}
                  playerPath={playerPath}
                />
              </div>

              {/* Logs - row 1 */}
              <LogsPanel logs={logs} />

              {/* Proof - row 2 */}
              <ProofPanel proof={proof} proving={proofHook.proving} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
