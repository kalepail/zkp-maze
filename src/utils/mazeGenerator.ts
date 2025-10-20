// Maze generator that matches the Python implementation
// Uses the same Recursive Backtracker algorithm for deterministic generation

import {
  NORTH,
  EAST,
  SOUTH,
  WEST,
  DIR_OFFSETS,
} from '../constants/maze';

interface Cell {
  row: number;
  col: number;
  walls: Record<number, boolean>;
  visited: boolean;
}

export interface MazeConfig {
  seed: number;
  rows: number;
  cols: number;
}

export class MazeGenerator {
  rows: number;
  cols: number;
  seed: number;
  private cells: Cell[][] = [];
  private rng: () => number;
  private rngState: number;
  // Start and end are always at opposite corners (cell coordinates)
  private readonly start: [number, number] = [0, 0];
  private readonly end: [number, number];

  constructor(rows: number, cols: number, seed: number) {
    this.rows = rows;
    this.cols = cols;
    this.seed = seed;
    this.rngState = seed;
    this.rng = this.createSeededRandom(seed);
    this.end = [rows - 1, cols - 1];
    this.initializeCells();
  }

  // Park-Miller Linear Congruential Generator (MINSTD)
  // Must match Python implementation exactly for deterministic maze generation
  // Multiplier: 48271, Modulus: 2^31 - 1 (2147483647)
  private createSeededRandom(_seed: number): () => number {
    return () => {
      this.rngState = (this.rngState * 48271) % 2147483647;
      return this.rngState / 2147483647;
    };
  }

  // Integer-only choice_index method matching Python/Rust implementations
  // Emulates: int((state / M) * n) = (state * n) / M
  private choiceIndex(n: number): number {
    const M = 2147483647; // 2^31 - 1
    this.rngState = (this.rngState * 48271) % M;
    // Use integer division to emulate float-based selection
    return Math.floor((this.rngState * n) / M);
  }

  private initializeCells() {
    for (let r = 0; r < this.rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({
          row: r,
          col: c,
          walls: { [NORTH]: true, [EAST]: true, [SOUTH]: true, [WEST]: true },
          visited: false,
        });
      }
      this.cells.push(row);
    }
  }

  private getOppositeDirection(direction: number): number {
    const opposites: Record<number, number> = {
      [NORTH]: SOUTH,
      [SOUTH]: NORTH,
      [EAST]: WEST,
      [WEST]: EAST,
    };
    return opposites[direction];
  }

  private getNeighbor(cell: Cell, direction: number): [number, number] {
    const [dr, dc] = DIR_OFFSETS[direction];
    return [cell.row + dr, cell.col + dc];
  }

  private isValidCell(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  private getUnvisitedNeighbors(cell: Cell): Array<[number, Cell]> {
    const neighbors: Array<[number, Cell]> = [];
    for (const direction of [NORTH, EAST, SOUTH, WEST]) {
      const [nr, nc] = this.getNeighbor(cell, direction);
      if (this.isValidCell(nr, nc)) {
        const neighborCell = this.cells[nr][nc];
        if (!neighborCell.visited) {
          neighbors.push([direction, neighborCell]);
        }
      }
    }
    return neighbors;
  }

  private removeWall(cell: Cell, direction: number, neighbor: Cell) {
    cell.walls[direction] = false;
    neighbor.walls[this.getOppositeDirection(direction)] = false;
  }

  generate() {
    const stack: Cell[] = [];
    let current = this.cells[this.start[0]][this.start[1]];
    current.visited = true;
    stack.push(current);

    while (stack.length > 0) {
      const neighbors = this.getUnvisitedNeighbors(current);
      if (neighbors.length > 0) {
        // Use integer-only arithmetic to match Python/Rust implementations
        const randomIndex = this.choiceIndex(neighbors.length);
        const [direction, nextCell] = neighbors[randomIndex];
        this.removeWall(current, direction, nextCell);
        nextCell.visited = true;
        stack.push(nextCell);
        current = nextCell;
      } else {
        // Match Python behavior: current = stack.pop()
        // This keeps current pointing to the popped cell
        current = stack.pop()!;
      }
    }
  }

  toBinaryGrid(): number[][] {
    // Grid size: rows*2 + 1 (to include walls between cells and borders)
    const gridRows = this.rows * 2 + 1;
    const gridCols = this.cols * 2 + 1;
    const grid: number[][] = Array(gridRows)
      .fill(0)
      .map(() => Array(gridCols).fill(0));

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        // Cell center position in grid
        const gr = row * 2 + 1;
        const gc = col * 2 + 1;
        grid[gr][gc] = 1; // Cell itself is always path

        // Open passages based on walls
        if (!cell.walls[NORTH]) grid[gr - 1][gc] = 1;
        if (!cell.walls[SOUTH]) grid[gr + 1][gc] = 1;
        if (!cell.walls[EAST]) grid[gr][gc + 1] = 1;
        if (!cell.walls[WEST]) grid[gr][gc - 1] = 1;
      }
    }

    return grid;
  }

  getGridCoordinates(): { start: [number, number]; end: [number, number] } {
    return {
      start: [this.start[0] * 2 + 1, this.start[1] * 2 + 1],
      end: [this.end[0] * 2 + 1, this.end[1] * 2 + 1],
    };
  }
}

export function generateMazeFromSeed(config: MazeConfig) {
  const generator = new MazeGenerator(
    config.rows,
    config.cols,
    config.seed
  );
  generator.generate();
  return {
    grid: generator.toBinaryGrid(),
    coordinates: generator.getGridCoordinates(),
  };
}
