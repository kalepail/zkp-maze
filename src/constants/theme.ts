// Theme constants for the maze game

export const COLORS = {
  // Maze colors
  wall: '#000000',
  path: '#ffffff',
  start: '#eab308',      // yellow
  end: '#4ade80',        // green
  player: '#3b82f6',     // blue
  playerPath: '#ef4444', // red
  direction: '#ef4444',  // red
} as const;

export const SIZES = {
  // Canvas
  cellSize: 10,
  playerRadius: 4,
  directionLineLength: 3,
  pathLineWidth: 2,
} as const;

export const ANIMATION = {
  // Auto-solve animation speed (milliseconds per move)
  autoSolveDelay: 10,
} as const;
