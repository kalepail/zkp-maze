// Maze constants - must match circuit/src/maze_config.nr
// These values are hardcoded in the Noir circuit and cannot be changed without recompiling

// Grid dimensions (binary grid including walls)
export const GRID_ROWS = 41;
export const GRID_COLS = 41;

// Cell dimensions (actual maze cells, excluding walls)
export const CELL_ROWS = 20;
export const CELL_COLS = 20;

// Start and end positions in grid coordinates
export const START_ROW = 1;
export const START_COL = 1;
export const END_ROW = 39;
export const END_COL = 39;

// Maximum moves allowed in the circuits
export const MAX_MOVES = 500; // Noir circuit supports 500 moves
export const MAX_MOVES_CIRCOM = 500; // Circom circuits now support 500 moves (full comparison)

// Direction constants (must match Noir circuit encoding)
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

// Direction offsets for movement
export const DIR_OFFSETS: Record<number, [number, number]> = {
  [NORTH]: [-1, 0],  // up (row decreases)
  [EAST]: [0, 1],    // right (col increases)
  [SOUTH]: [1, 0],   // down (row increases)
  [WEST]: [0, -1],   // left (col decreases)
};

// Direction names for UI display
export const DIRECTION_NAMES: Record<number, string> = {
  [NORTH]: 'North',
  [EAST]: 'East',
  [SOUTH]: 'South',
  [WEST]: 'West',
};
