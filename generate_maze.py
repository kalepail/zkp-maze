#!/usr/bin/env python3
"""
Maze Generator for Noir ZK Proof Verification
Generates deterministic, solvable mazes using Recursive Backtracker algorithm.

Outputs:
1. Maze grid array for Noir circuit (hardcoded)
2. Seed for frontend to recreate the same maze

Uses Park-Miller LCG (MINSTD) for deterministic cross-language RNG:
- Multiplier: 48271
- Modulus: 2147483647 (2^31 - 1)
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, List, Tuple, Dict

# Configuration constants - must match src/constants/maze.ts and circuit-noir/src/maze_config.nr
MAX_MOVES = 500  # Maximum number of moves allowed in solution
CELL_ROWS = 20  # Maze dimensions in cells (not including walls)
CELL_COLS = 20  # Must equal CELL_ROWS (square maze requirement)
GRID_SIZE = 41  # Grid dimensions including walls (CELL_ROWS * 2 + 1) - square maze
START_POS = 1  # Start position in grid coordinates (both row and col)
END_POS = 39  # End position in grid coordinates (GRID_SIZE - 2, both row and col)

# Direction constants matching frontend encoding
NORTH, EAST, SOUTH, WEST = 0, 1, 2, 3
DIRECTIONS = [NORTH, EAST, SOUTH, WEST]
DIR_OFFSETS = {
    NORTH: (-1, 0),  # up (row decreases)
    EAST: (0, 1),    # right (col increases)
    SOUTH: (1, 0),   # down (row increases)
    WEST: (0, -1),   # left (col decreases)
}

class SimpleLCG:
    """Park-Miller Linear Congruential Generator (MINSTD)

    This RNG is chosen for its simplicity and ability to be implemented
    identically in both Python and JavaScript, ensuring deterministic
    maze generation from the same seed across both platforms.
    """
    def __init__(self, seed: int):
        # Ensure seed is non-zero (0 would produce all zeros)
        self.state = seed if seed != 0 else 1

    def next(self) -> float:
        """Generate next random number in range [0, 1)"""
        # Park-Miller constants: a = 48271, m = 2^31 - 1
        self.state = (self.state * 48271) % 2147483647
        return self.state / 2147483647

    def randint(self, a: int, b: int) -> int:
        """Generate random integer in range [a, b]"""
        return a + int(self.next() * (b - a + 1))

    def choice(self, items: List) -> Any:
        """Choose random item from list"""
        return items[int(self.next() * len(items))]

class Cell:
    def __init__(self, row: int, col: int):
        self.row = row
        self.col = col
        self.walls = {NORTH: True, EAST: True, SOUTH: True, WEST: True}
        self.visited = False

class Maze:
    def __init__(self, rows: int, cols: int, seed: int = None):
        # Validate dimensions
        if rows <= 0 or cols <= 0:
            raise ValueError(f"Maze dimensions must be positive (got {rows}x{cols})")

        self.rows = rows
        self.cols = cols
        # Generate random seed if not provided
        if seed is None:
            import random
            self.seed = random.randint(0, 2**32 - 1)
        else:
            self.seed = seed
        self.rng = SimpleLCG(self.seed)
        self.cells = [[Cell(r, c) for c in range(cols)] for r in range(rows)]
        # Start and end are always at opposite corners in cell coordinates
        self.start = (0, 0)
        self.end = (rows - 1, cols - 1)

    def get_opposite_direction(self, direction: int) -> int:
        """Get the opposite direction."""
        opposites = {NORTH: SOUTH, SOUTH: NORTH, EAST: WEST, WEST: EAST}
        return opposites[direction]

    def get_neighbor(self, cell: Cell, direction: int) -> Tuple[int, int]:
        """Get neighbor cell coordinates in given direction."""
        dr, dc = DIR_OFFSETS[direction]
        return (cell.row + dr, cell.col + dc)

    def is_valid_cell(self, row: int, col: int) -> bool:
        """Check if cell coordinates are within bounds."""
        return 0 <= row < self.rows and 0 <= col < self.cols

    def get_unvisited_neighbors(self, cell: Cell) -> List[Tuple[int, Cell]]:
        """Get list of unvisited neighboring cells with their directions."""
        neighbors = []
        for direction in DIRECTIONS:
            nr, nc = self.get_neighbor(cell, direction)
            if self.is_valid_cell(nr, nc):
                neighbor_cell = self.cells[nr][nc]
                if not neighbor_cell.visited:
                    neighbors.append((direction, neighbor_cell))
        return neighbors

    def remove_wall(self, cell: Cell, direction: int, neighbor: Cell):
        """Remove wall between current cell and neighbor."""
        cell.walls[direction] = False
        neighbor.walls[self.get_opposite_direction(direction)] = False

    def generate_recursive_backtracker(self):
        """Generate maze using Recursive Backtracker (DFS) algorithm."""
        stack = []
        current = self.cells[self.start[0]][self.start[1]]
        current.visited = True
        stack.append(current)

        while stack:
            neighbors = self.get_unvisited_neighbors(current)
            if neighbors:
                direction, next_cell = self.rng.choice(neighbors)
                self.remove_wall(current, direction, next_cell)
                next_cell.visited = True
                stack.append(next_cell)
                current = next_cell
            else:
                current = stack.pop()

    def to_binary_grid(self) -> List[List[int]]:
        """
        Convert maze to binary grid for Noir circuit.
        Each cell becomes a 3x3 block where:
        - Center (1,1) is always 1 (path)
        - Walls are 0, open passages are 1

        For a 20x20 maze, this creates a 41x41 grid (20*2 + 1)
        """
        # Grid size: rows*2 + 1 (to include walls between cells and borders)
        grid_rows = self.rows * 2 + 1
        grid_cols = self.cols * 2 + 1
        grid = [[0 for _ in range(grid_cols)] for _ in range(grid_rows)]

        for row in range(self.rows):
            for col in range(self.cols):
                cell = self.cells[row][col]
                # Cell center position in grid
                gr, gc = row * 2 + 1, col * 2 + 1
                grid[gr][gc] = 1  # Cell itself is always path

                # Open passages based on walls
                if not cell.walls[NORTH]:
                    grid[gr - 1][gc] = 1
                if not cell.walls[SOUTH]:
                    grid[gr + 1][gc] = 1
                if not cell.walls[EAST]:
                    grid[gr][gc + 1] = 1
                if not cell.walls[WEST]:
                    grid[gr][gc - 1] = 1

        return grid

    def get_grid_coordinates(self) -> Tuple[Tuple[int, int], Tuple[int, int]]:
        """Get start and end coordinates in the binary grid."""
        start_grid = (self.start[0] * 2 + 1, self.start[1] * 2 + 1)
        end_grid = (self.end[0] * 2 + 1, self.end[1] * 2 + 1)
        return start_grid, end_grid

    def solve_bfs(self) -> List[Tuple[int, int]]:
        """Solve the maze using BFS and return the path."""
        from collections import deque

        grid = self.to_binary_grid()
        start_grid, end_grid = self.get_grid_coordinates()

        queue = deque([(start_grid, [start_grid])])
        visited = {start_grid}

        while queue:
            pos, path = queue.popleft()
            row, col = pos

            if pos == end_grid:
                return path

            # Try all four directions
            for dr, dc in [(-1, 0), (0, 1), (1, 0), (0, -1)]:
                new_row, new_col = row + dr, col + dc
                new_pos = (new_row, new_col)

                if (0 <= new_row < len(grid) and
                    0 <= new_col < len(grid[0]) and
                    grid[new_row][new_col] == 1 and
                    new_pos not in visited):
                    visited.add(new_pos)
                    queue.append((new_pos, path + [new_pos]))

        return []  # No solution found

    def path_to_moves(self, path: List[Tuple[int, int]]) -> List[int]:
        """Convert path to uncompressed moves format - one direction per step."""
        if len(path) < 2:
            return []

        # Convert path to simple direction moves (no compression)
        moves = []

        for i in range(1, len(path)):
            prev = path[i - 1]
            curr = path[i]
            dr = curr[0] - prev[0]
            dc = curr[1] - prev[1]

            # Determine direction and add it
            if dr == -1:
                moves.append(NORTH)  # 0
            elif dr == 1:
                moves.append(SOUTH)  # 2
            elif dc == 1:
                moves.append(EAST)   # 1
            else:
                moves.append(WEST)   # 3

        return moves

    def export_maze_config(self, output_path: Path, grid: List[List[int]],
                           start_grid: Tuple[int, int], end_grid: Tuple[int, int],
                           path_length: int, moves_count: int, sample_moves: List[int]):
        """Export maze configuration to Noir circuit file."""
        # Validate square maze assumption
        if len(grid) != len(grid[0]):
            raise ValueError(f"Maze must be square! Got {len(grid)}x{len(grid[0])}")

        # Validate start/end positions match (diagonal corners)
        if start_grid[0] != start_grid[1]:
            raise ValueError(f"Start position must be diagonal (row == col), got {start_grid}")
        if end_grid[0] != end_grid[1]:
            raise ValueError(f"End position must be diagonal (row == col), got {end_grid}")

        # Format as Noir array
        grid_str = "[\n"
        for row in grid:
            grid_str += "        [" + ", ".join(str(cell) for cell in row) + "],\n"
        grid_str = grid_str.rstrip(",\n") + "\n    ]"

        noir_code = f"""// Auto-generated by generate_maze.py - do not edit manually!
// Seed: {self.seed}
// Maze size: {self.rows}x{self.cols} cells
// Grid size: {len(grid)}x{len(grid[0])} (includes walls)

pub global MAZE_SEED: u32 = {self.seed};
pub global MAZE_SIZE: u8 = {len(grid)};  // Square maze
pub global START_POS: u8 = {start_grid[0]};   // Both row and col start at {start_grid[0]}
pub global END_POS: u8 = {end_grid[0]};    // Both row and col end at {end_grid[0]}

pub global MAZE: [[u8; {len(grid[0])}]; {len(grid)}] = {grid_str};

// Test solution (generated by BFS)
// Path length: {path_length} positions
// Moves: {moves_count} directions (uncompressed)
// Sample: {sample_moves[:30]}{'...' if len(sample_moves) > 30 else ''}
"""

        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(noir_code)
            print(f"✅ Noir configuration written to {output_path}")
            print(f"   Grid size: {len(grid)}x{len(grid[0])} (square)")
            print(f"   Start: ({start_grid[0]}, {start_grid[0]}), End: ({end_grid[0]}, {end_grid[0]})")
            print(f"   Solution: {path_length} positions, {moves_count} moves")
            print(f"   Sample moves: {sample_moves[:40]}{'...' if len(sample_moves) > 40 else ''}")
        except IOError as e:
            raise IOError(f"Failed to write maze config to {output_path}: {e}")

    def export_prover_inputs(self, output_path: Path, moves: List[int]):
        """Export prover inputs to Prover.toml file."""
        padded_moves = moves + [0] * (MAX_MOVES - len(moves))

        prover_content = f"""# Auto-generated by generate_maze.py - do not edit manually!
# Seed: {self.seed}
# {len(moves)} actual moves + {MAX_MOVES - len(moves)} padding zeros = {MAX_MOVES} total

maze_seed = {self.seed}
moves = [{', '.join(map(str, padded_moves))}]
"""

        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(prover_content)
            print(f"✅ Prover inputs written to {output_path}")
        except IOError as e:
            raise IOError(f"Failed to write prover inputs to {output_path}: {e}")

    def export_test_solution(self, output_path: Path, moves: List[int]):
        """Export test solution to test_solutions.nr file."""
        padded_moves = moves + [0] * (MAX_MOVES - len(moves))

        test_content = f"""// Auto-generated by generate_maze.py - do not edit manually!
// Seed: {self.seed}

use crate::main;
use crate::maze_config::MAZE_SEED;

#[test]
fn test_generated_solution() {{
    // BFS-generated solution: {len(moves)} moves + {MAX_MOVES - len(moves)} padding zeros = {MAX_MOVES} total
    let moves = [{', '.join(map(str, padded_moves))}];

    // This should pass if the circuit logic is correct
    main(moves, MAZE_SEED);
}}
"""

        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(test_content)
            print(f"✅ Test solution written to {output_path}")
        except IOError as e:
            raise IOError(f"Failed to write test solution to {output_path}: {e}")

    def export_risczero_moves(self, output_path: Path, moves: List[int]):
        """Export moves to circuit-risczero directory as JSON file."""
        moves_json = json.dumps(moves, indent=2)

        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(moves_json + "\n")
            print(f"✅ RISC Zero moves written to {output_path}")
        except IOError as e:
            raise IOError(f"Failed to write RISC Zero moves to {output_path}: {e}")

    def export_for_noir(self):
        """Export maze configuration for Noir circuit with test case and prover inputs."""
        output_dir = Path(".")

        grid = self.to_binary_grid()
        start_grid, end_grid = self.get_grid_coordinates()

        # Solve the maze and validate it's solvable
        path = self.solve_bfs()
        if not path:
            raise ValueError("Generated maze is not solvable!")

        moves = self.path_to_moves(path)

        # Export to three separate files
        maze_config_path = output_dir / "circuit-noir" / "src" / "maze_config.nr"
        prover_path = output_dir / "circuit-noir" / "Prover.toml"
        test_path = output_dir / "circuit-noir" / "src" / "test_solutions.nr"
        risczero_moves_path = output_dir / "circuit-risczero" / f"{self.seed}_moves.json"

        self.export_maze_config(maze_config_path, grid, start_grid, end_grid,
                               len(path), len(moves), moves)
        self.export_prover_inputs(prover_path, moves)
        self.export_test_solution(test_path, moves)
        self.export_risczero_moves(risczero_moves_path, moves)

    def export_for_frontend(self):
        """Export minimal config for frontend (seed only - frontend generates maze)."""
        output_path = Path("src") / "maze_seed.json"

        config = {
            "seed": self.seed,
            "rows": self.rows,
            "cols": self.cols
        }

        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(config, indent=2))
            print(f"✅ Frontend config written to {output_path}")
            print(f"   Seed: {self.seed}")
            print(f"   Size: {self.rows}x{self.cols} cells")
            print(f"   Note: Frontend will generate maze from seed")
        except IOError as e:
            raise IOError(f"Failed to write frontend config to {output_path}: {e}")

    def visualize(self) -> str:
        """Create ASCII visualization of the maze."""
        grid = self.to_binary_grid()
        lines = []
        for row in grid:
            # Double each character horizontally to compensate for terminal character aspect ratio
            line = "".join(("██" if cell == 0 else "  ") for cell in row)
            lines.append(line)
        return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(
        description="Generate deterministic, solvable mazes for Noir ZK proof verification",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "seed",
        type=int,
        nargs="?",
        help="Random seed for maze generation (random if not specified)"
    )
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Skip ASCII visualization preview"
    )

    args = parser.parse_args()

    try:
        # Generate maze
        print(f"🎲 Generating {CELL_ROWS}x{CELL_COLS} maze...")
        maze = Maze(CELL_ROWS, CELL_COLS, args.seed)
        maze.generate_recursive_backtracker()

        print(f"🌱 Seed: {maze.seed}")
        print()

        # Export for Noir
        maze.export_for_noir()

        # Export for frontend
        maze.export_for_frontend()

        # Show preview
        if not args.no_preview:
            print()
            print("Preview:")
            print(maze.visualize())

        print()
        print(f"✨ To regenerate this exact maze, run: python3 generate_maze.py {maze.seed}")

    except (ValueError, IOError) as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
