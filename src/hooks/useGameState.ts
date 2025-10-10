import { useState, useCallback, useRef, useEffect } from 'react';
import { NORTH, EAST, SOUTH, WEST, START_ROW, START_COL, END_ROW, END_COL } from '../constants/maze';

export interface GameState {
  maze: number[][];
  playerPos: [number, number];
  startPos: [number, number];
  endPos: [number, number];
  currentDir: number;
  moves: number[];
  playerPath: [number, number][];
  won: boolean;
  autoSolving: boolean;
  elapsedTime: number;
}

export function useGameState(initialMaze: number[][]) {
  const [maze, setMaze] = useState<number[][]>(initialMaze);
  const [playerPos, setPlayerPos] = useState<[number, number]>([START_ROW, START_COL]);
  const [startPos] = useState<[number, number]>([START_ROW, START_COL]);
  const [endPos] = useState<[number, number]>([END_ROW, END_COL]);

  // Update maze when initialMaze changes
  useEffect(() => {
    if (initialMaze.length > 0) {
      setMaze(initialMaze);
    }
  }, [initialMaze]);
  const [currentDir, setCurrentDir] = useState(NORTH);
  const [moves, setMoves] = useState<number[]>([]);
  const [playerPath, setPlayerPath] = useState<[number, number][]>([[START_ROW, START_COL]]);
  const [won, setWon] = useState(false);
  const [autoSolving, setAutoSolving] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start timer when first move is made
  useEffect(() => {
    // Start timer on first move
    if (moves.length === 1 && !won && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
  }, [moves.length, won]);

  // Stop timer when won or cleanup on unmount
  useEffect(() => {
    if (won && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [won]);

  const handleMove = useCallback(
    (direction: number) => {
      // Don't process moves if game state prevents it or maze isn't loaded
      if (won || autoSolving || maze.length === 0) return;

      const offsets: Record<number, [number, number]> = {
        [NORTH]: [-1, 0],
        [SOUTH]: [1, 0],
        [EAST]: [0, 1],
        [WEST]: [0, -1],
      };

      const [dr, dc] = offsets[direction];
      const newRow = playerPos[0] + dr;
      const newCol = playerPos[1] + dc;

      // Check if move is valid (within bounds and not a wall)
      if (
        newRow >= 0 &&
        newRow < maze.length &&
        newCol >= 0 &&
        newCol < maze[0].length &&
        maze[newRow][newCol] === 1
      ) {
        // Move is valid - update direction, position, and record the move
        setCurrentDir(direction);
        const newPos: [number, number] = [newRow, newCol];
        setPlayerPos(newPos);
        setPlayerPath((prev) => [...prev, newPos]);
        setMoves((prev) => [...prev, direction]);

        if (newRow === endPos[0] && newCol === endPos[1]) {
          setWon(true);
        }
      } else {
        // Move is invalid (hit a wall or boundary) - just update direction indicator
        setCurrentDir(direction);
      }
    },
    [playerPos, maze, endPos, won, autoSolving]
  );

  const reset = useCallback(() => {
    setPlayerPos(startPos);
    setPlayerPath([startPos]);
    setCurrentDir(NORTH);
    setMoves([]);
    setWon(false);
    setAutoSolving(false);
    setElapsedTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [startPos]);

  return {
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
  };
}
