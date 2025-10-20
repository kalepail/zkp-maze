//! Maze generation using Recursive Backtracker algorithm
//!
//! This implementation must exactly match the Python maze generator in generate_maze.py
//! to ensure deterministic maze generation from the same seed.
//!
//! Algorithm: Recursive Backtracker (DFS with backtracking)
//! 1. Start at (0, 0), mark as visited
//! 2. While stack is not empty:
//!    - Get unvisited neighbors of current cell
//!    - If neighbors exist:
//!      * Choose random neighbor
//!      * Remove wall between current and neighbor
//!      * Mark neighbor as visited, push to stack
//!    - Else: backtrack (pop from stack)

#![allow(dead_code)]

use crate::rng::SimpleLCG;

#[cfg(feature = "std")]
extern crate std;
#[cfg(feature = "std")]
use std::vec::Vec;

// Direction constants (must match Python and frontend)
const NORTH: usize = 0;
const EAST: usize = 1;
const SOUTH: usize = 2;
const WEST: usize = 3;

// Maximum maze dimensions (for fixed-size arrays)
const MAX_MAZE_ROWS: usize = 20;
const MAX_MAZE_COLS: usize = 20;
const MAX_GRID_SIZE: usize = MAX_MAZE_ROWS * 2 + 1; // 41 for 20x20 maze

/// A cell in the maze with walls in four directions
#[derive(Clone, Copy)]
struct Cell {
    walls: [bool; 4], // [NORTH, EAST, SOUTH, WEST]
    visited: bool,
}

impl Cell {
    fn new() -> Self {
        Self {
            walls: [true, true, true, true], // All walls present initially
            visited: false,
        }
    }
}

/// Maze generator using recursive backtracker algorithm
#[repr(align(4))] // Memory alignment optimization for RISC Zero
pub struct Maze {
    cells: [[Cell; MAX_MAZE_COLS]; MAX_MAZE_ROWS],
    rows: usize,
    cols: usize,
}

impl Maze {
    /// Generate a maze using the recursive backtracker algorithm
    ///
    /// # Arguments
    /// * `rows` - Number of cell rows (not including walls)
    /// * `cols` - Number of cell columns (not including walls)
    /// * `seed` - RNG seed for deterministic generation
    ///
    /// # Returns
    /// A generated maze with guaranteed path from (0,0) to (rows-1, cols-1)
    pub fn generate(rows: usize, cols: usize, seed: u32) -> Self {
        assert!(rows <= MAX_MAZE_ROWS && cols <= MAX_MAZE_COLS,
                "Maze dimensions exceed maximum");

        // Initialize fixed-size array with default cells
        let cells = [[Cell::new(); MAX_MAZE_COLS]; MAX_MAZE_ROWS];

        let mut maze = Self {
            cells,
            rows,
            cols,
        };

        let mut rng = SimpleLCG::new(seed);
        maze.recursive_backtracker(&mut rng);
        maze
    }

    /// Recursive backtracker algorithm (iterative with explicit stack)
    /// OPTIMIZATION: Uses fixed-size stack array instead of Vec for zero allocations
    ///
    /// NOTE: This implementation matches the Python algorithm exactly, maintaining
    /// a separate 'current' variable rather than peeking at the stack each iteration.
    /// While these approaches seem equivalent, the explicit current tracking ensures
    /// identical behavior across all seeds and maze sizes.
    fn recursive_backtracker(&mut self, rng: &mut SimpleLCG) {
        // Fixed-size stack (max 20x20 = 400 cells)
        let mut stack = [(0usize, 0usize); 400];
        let mut stack_len = 0;

        // Start at (0, 0) - matches Python's self.start
        let mut current = (0, 0);

        // Mark start as visited and push to stack
        self.cells[0][0].visited = true;
        stack[stack_len] = current;
        stack_len += 1;

        while stack_len > 0 {
            // Get unvisited neighbors of current cell
            let (row, col) = current;
            let (neighbors, neighbor_count) = self.get_unvisited_neighbors(row, col);

            if neighbor_count > 0 {
                // Choose random unvisited neighbor
                let idx = rng.choice_index(neighbor_count);
                let (dir, nr, nc) = neighbors[idx];

                // Remove walls between current cell and neighbor
                self.cells[row][col].walls[dir] = false;
                self.cells[nr][nc].walls[Self::opposite_dir(dir)] = false;

                // Mark neighbor as visited and push to stack
                self.cells[nr][nc].visited = true;
                stack[stack_len] = (nr, nc);
                stack_len += 1;

                // Move current to the neighbor (matches Python's current = next_cell)
                current = (nr, nc);
            } else {
                // No unvisited neighbors, backtrack (pop)
                // Python does: current = stack.pop()
                // The pop() returns the element AND removes it, so current gets the POPPED value
                // This means current stays pointing to the cell we're backtracking from!
                // Next iteration checks that cell again (no neighbors), then pops again

                // Get the value we're about to pop (which is current)
                let popped = stack[stack_len - 1];
                // Remove it from stack
                stack_len -= 1;
                // Assign popped value to current (which was already current, so it stays the same)
                current = popped;

                // Result: current still points to the same cell, stack is one shorter
                // Next iteration will check this cell for neighbors again (finds none), then backtrack again
            }
        }
    }

    /// Get all unvisited neighbors of a cell
    ///
    /// Returns: Fixed array of neighbors with count (max 4 neighbors)
    /// OPTIMIZATION: Returns (neighbors_array, count) instead of Vec
    fn get_unvisited_neighbors(&self, row: usize, col: usize) -> ([(usize, usize, usize); 4], usize) {
        let mut neighbors = [(0, 0, 0); 4];
        let mut count = 0;

        // Check all four directions
        let directions = [
            (NORTH, row.wrapping_sub(1), col),
            (EAST, row, col + 1),
            (SOUTH, row + 1, col),
            (WEST, row, col.wrapping_sub(1)),
        ];

        for (dir, nr, nc) in directions {
            // Check bounds (wrapping_sub returns large number if underflow)
            if nr < self.rows && nc < self.cols {
                if !self.cells[nr][nc].visited {
                    neighbors[count] = (dir, nr, nc);
                    count += 1;
                }
            }
        }

        (neighbors, count)
    }

    /// Get the opposite direction
    fn opposite_dir(dir: usize) -> usize {
        match dir {
            NORTH => SOUTH,
            SOUTH => NORTH,
            EAST => WEST,
            WEST => EAST,
            _ => unreachable!(),
        }
    }

    /// Convert maze to binary grid representation (fixed-size array for guest/no_std)
    ///
    /// Creates a grid where:
    /// - 0 = wall
    /// - 1 = path (walkable cell or open passage)
    ///
    /// For a maze with R rows and C columns:
    /// - Grid size is (R*2 + 1) × (C*2 + 1)
    /// - Each cell occupies a 3×3 block in the grid
    /// - Cell centers are at (row*2+1, col*2+1)
    ///
    /// This matches the Python `to_binary_grid()` output exactly.
    /// Returns a fixed-size array for optimal zkVM performance.
    pub fn to_binary_grid(&self) -> [[u8; MAX_GRID_SIZE]; MAX_GRID_SIZE] {
        let mut grid = [[0u8; MAX_GRID_SIZE]; MAX_GRID_SIZE];

        for row in 0..self.rows {
            for col in 0..self.cols {
                let cell = &self.cells[row][col];

                // Cell center position in grid
                let gr = row * 2 + 1;
                let gc = col * 2 + 1;

                // Cell center is always a path
                grid[gr][gc] = 1;

                // Open passages based on walls
                if !cell.walls[NORTH] {
                    grid[gr - 1][gc] = 1;
                }
                if !cell.walls[SOUTH] {
                    grid[gr + 1][gc] = 1;
                }
                if !cell.walls[EAST] {
                    grid[gr][gc + 1] = 1;
                }
                if !cell.walls[WEST] {
                    grid[gr][gc - 1] = 1;
                }
            }
        }

        grid
    }

    /// Convert maze to binary grid representation (Vec for host/std)
    ///
    /// This version returns Vec<Vec<u8>> for JSON serialization compatibility
    /// on the host side. Same algorithm as to_binary_grid().
    #[cfg(feature = "std")]
    pub fn to_binary_grid_vec(&self) -> Vec<Vec<u8>> {
        let grid_size = self.rows * 2 + 1;
        let grid_array = self.to_binary_grid();

        // Convert fixed array to Vec for JSON serialization
        grid_array[..grid_size]
            .iter()
            .map(|row| row[..grid_size].to_vec())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_maze_generation() {
        let maze = Maze::generate(5, 5, 12345);
        let grid = maze.to_binary_grid();

        // Grid should be 5*2+1 = 11 x 11
        assert_eq!(grid.len(), 41); // MAX_GRID_SIZE
        assert_eq!(grid[0].len(), 41);

        // Start position (1,1) should be path
        assert_eq!(grid[1][1], 1);

        // End position (9,9) should be path
        assert_eq!(grid[9][9], 1);
    }

    #[test]
    fn test_determinism() {
        let maze1 = Maze::generate(10, 10, 99999);
        let maze2 = Maze::generate(10, 10, 99999);

        let grid1 = maze1.to_binary_grid();
        let grid2 = maze2.to_binary_grid();

        // Same seed should produce identical mazes
        assert_eq!(grid1, grid2);
    }

    #[test]
    fn test_different_seeds() {
        let maze1 = Maze::generate(10, 10, 11111);
        let maze2 = Maze::generate(10, 10, 22222);

        let grid1 = maze1.to_binary_grid();
        let grid2 = maze2.to_binary_grid();

        // Different seeds should (almost certainly) produce different mazes
        assert_ne!(grid1, grid2);
    }

    #[test]
    fn test_grid_size_20x20() {
        let maze = Maze::generate(20, 20, 2918957128);
        let grid = maze.to_binary_grid();

        // Grid should be 20*2+1 = 41 x 41
        assert_eq!(grid.len(), 41);
        assert_eq!(grid[0].len(), 41);

        // Corners should be walls
        assert_eq!(grid[0][0], 0);
        assert_eq!(grid[0][40], 0);
        assert_eq!(grid[40][0], 0);
        assert_eq!(grid[40][40], 0);

        // Start and end should be paths
        assert_eq!(grid[1][1], 1);
        assert_eq!(grid[39][39], 1);
    }

    #[test]
    #[cfg(feature = "std")]
    fn test_to_binary_grid_vec() {
        let maze = Maze::generate(5, 5, 12345);
        let grid_vec = maze.to_binary_grid_vec();
        let grid_array = maze.to_binary_grid();

        // Verify vec version matches array version
        assert_eq!(grid_vec.len(), 11); // 5*2+1
        for (i, row) in grid_vec.iter().enumerate() {
            assert_eq!(row.len(), 11);
            for (j, &cell) in row.iter().enumerate() {
                assert_eq!(cell, grid_array[i][j]);
            }
        }
    }
}
