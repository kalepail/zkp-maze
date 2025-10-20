#![no_main]
#![no_std]

extern crate alloc;

use risc0_zkvm::guest::env;
use risc0_zkvm::sha::{Impl as SHA256, Sha256};
use maze_core::{MazeJournal, Maze, MAZE_ROWS, MAZE_COLS};

risc0_zkvm::guest::entry!(main);

/// Maze Generation Guest Program (Hash-Based Architecture)
///
/// This program generates a maze from a seed and commits a SHA-256 hash
/// of the grid to the journal. This reduces journal size by 97.9% while
/// maintaining cryptographic integrity.
///
/// SECURITY MODEL:
/// - Deterministic maze generation ensures same seed = same maze
/// - zkVM receipt cryptographically guarantees maze authenticity
/// - Grid hash serves as a commitment to the maze configuration
/// - Anyone can verify the maze by regenerating and hashing the grid
///
/// PERFORMANCE:
/// - Journal size: 36 bytes (vs 1,685 bytes previously)
/// - SHA-256 cost: ~1,842 cycles (6 + 68×27 blocks)
/// - Negligible overhead (~0.04% of total execution)

fn main() {
    // Read maze seed from host
    let maze_seed: u32 = env::read();

    // Generate maze from seed (deterministic)
    let maze = Maze::generate(MAZE_ROWS, MAZE_COLS, maze_seed);
    let grid = maze.to_binary_grid();

    // Flatten the grid into a byte array for hashing
    let mut grid_bytes = [0u8; (MAZE_ROWS * 2 + 1) * (MAZE_ROWS * 2 + 1)];
    let grid_size = MAZE_ROWS * 2 + 1;
    for i in 0..grid_size {
        for j in 0..grid_size {
            grid_bytes[i * grid_size + j] = grid[i][j];
        }
    }

    // Hash the grid using RISC Zero's accelerated SHA-256
    // Cost: 6 + 68 × ceil(1681/64) = 6 + 68 × 27 = 1,842 cycles
    let hash_digest = SHA256::hash_bytes(&grid_bytes);
    let hash_bytes = hash_digest.as_bytes();

    // Convert to fixed-size array
    let mut grid_hash = [0u8; 32];
    grid_hash.copy_from_slice(hash_bytes);

    // Create journal output with grid hash
    let journal = MazeJournal {
        maze_seed,
        grid_hash,
    };

    // Commit to journal
    // Format: maze_seed (u32, 4 bytes) + grid_hash (32 bytes) = 36 bytes
    // This is 97.9% smaller than the previous 1,685 byte journal!
    env::commit(&journal.maze_seed);
    env::commit_slice(&journal.grid_hash);
}
