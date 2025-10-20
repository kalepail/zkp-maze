//! Shared types, constants, and logic for the maze proof system
//!
//! This crate provides common data structures and maze generation
//! logic used across both the maze generation and path verification
//! guest programs, as well as the host program.
//!
//! The crate is no_std compatible for use in RISC Zero guest programs,
//! with optional std features for host-side convenience.

#![no_std]

// Re-export shared modules
pub mod rng;
pub mod maze_gen;

// Re-export commonly used types for convenience
pub use rng::SimpleLCG;
pub use maze_gen::Maze;

/// Maze dimensions (cells, not including walls)
pub const MAZE_ROWS: usize = 20;
pub const MAZE_COLS: usize = 20;

/// Grid size is MAZE_ROWS * 2 + 1 (includes walls)
pub const GRID_SIZE: usize = MAZE_ROWS * 2 + 1; // 41 for 20x20 maze

/// Maximum number of moves allowed in a path
pub const MAX_MOVES: usize = 500;

/// Total size of the grid data (GRID_SIZE * GRID_SIZE)
pub const GRID_DATA_SIZE: usize = GRID_SIZE * GRID_SIZE; // 1681 for 41x41 grid

/// SHA-256 hash size
pub const HASH_SIZE: usize = 32;

/// Size of the maze journal (seed + grid_hash)
/// 4 bytes (u32 seed) + 32 bytes (SHA-256 hash) = 36 bytes
/// This is 97.9% smaller than the previous 1,685 byte journal!
pub const MAZE_JOURNAL_SIZE: usize = 4 + HASH_SIZE;

/// Journal output from maze generation proof
///
/// This structure is committed to the journal and can be read
/// by the path verification proof to verify the maze grid.
///
/// The grid hash serves as a cryptographic commitment to the maze.
/// The actual grid data is passed separately to the path verification
/// program and verified against this hash.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct MazeJournal {
    /// The seed used to generate this maze
    pub maze_seed: u32,

    /// SHA-256 hash of the binary grid data
    /// This allows the journal to be 97.9% smaller while maintaining
    /// cryptographic integrity. The grid is verified by hashing it
    /// and comparing to this committed hash.
    pub grid_hash: [u8; HASH_SIZE],
}

/// Journal output from path verification proof
///
/// This structure contains the result of path verification
/// along with metadata about the maze and player.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct PathJournal {
    /// Whether the path successfully reached the goal
    pub is_valid: u32, // Using u32 for RISC Zero compatibility (0 or 1)

    /// The seed of the maze this path was verified against
    pub maze_seed: u32,
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constants() {
        assert_eq!(GRID_SIZE, 41);
        assert_eq!(MAZE_ROWS * 2 + 1, GRID_SIZE);
    }

}
