import { useEffect, useRef } from 'react';
import { COLORS, SIZES } from '../constants/theme';

export interface CanvasDrawProps {
  maze: number[][];
  playerPos: [number, number];
  startPos: [number, number];
  endPos: [number, number];
  currentDir: number;
  playerPath: [number, number][];
}

export function useMazeCanvas({
  maze,
  playerPos,
  startPos,
  endPos,
  currentDir,
  playerPath,
}: CanvasDrawProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || maze.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { cellSize } = SIZES;
    canvas.width = maze[0].length * cellSize;
    canvas.height = maze.length * cellSize;

    // Draw maze
    for (let row = 0; row < maze.length; row++) {
      for (let col = 0; col < maze[0].length; col++) {
        ctx.fillStyle = maze[row][col] === 0 ? COLORS.wall : COLORS.path;
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }

    // Draw start position
    ctx.fillStyle = COLORS.start;
    ctx.fillRect(startPos[1] * cellSize, startPos[0] * cellSize, cellSize, cellSize);

    // Draw end position
    ctx.fillStyle = COLORS.end;
    ctx.fillRect(endPos[1] * cellSize, endPos[0] * cellSize, cellSize, cellSize);

    // Draw path trace
    if (playerPath.length > 1) {
      ctx.strokeStyle = COLORS.playerPath;
      ctx.lineWidth = SIZES.pathLineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (let i = 0; i < playerPath.length; i++) {
        const [row, col] = playerPath[i];
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // Draw player
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(
      playerPos[1] * cellSize + cellSize / 2,
      playerPos[0] * cellSize + cellSize / 2,
      SIZES.playerRadius,
      0,
      2 * Math.PI
    );
    ctx.fill();

    // Draw direction indicator
    ctx.strokeStyle = COLORS.direction;
    ctx.lineWidth = SIZES.pathLineWidth;
    ctx.beginPath();
    const centerX = playerPos[1] * cellSize + cellSize / 2;
    const centerY = playerPos[0] * cellSize + cellSize / 2;
    const dirOffset = {
      0: [0, -SIZES.directionLineLength], // NORTH
      1: [SIZES.directionLineLength, 0],  // EAST
      2: [0, SIZES.directionLineLength],  // SOUTH
      3: [-SIZES.directionLineLength, 0], // WEST
    }[currentDir];
    if (dirOffset) {
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + dirOffset[0], centerY + dirOffset[1]);
      ctx.stroke();
    }
  }, [maze, playerPos, startPos, endPos, currentDir, playerPath]);

  return canvasRef;
}
