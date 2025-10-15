#![no_main]
#![no_std]

extern crate alloc;

use risc0_zkvm::guest::env;
use risc0_zkvm::sha::{Digest, Impl as SHA256, Sha256};
use maze_core::{PathJournal, MAX_MOVES, GRID_SIZE, GRID_DATA_SIZE, MAZE_JOURNAL_SIZE};

risc0_zkvm::guest::entry!(main);

// OPTIMIZATION: Direction delta lookup tables for fast move computation
// Row deltas: [NORTH, EAST, SOUTH, WEST] = [-1, 0, +1, 0]
const ROW_DELTAS: [i32; 4] = [-1, 0, 1, 0];
// Col deltas: [NORTH, EAST, SOUTH, WEST] = [0, +1, 0, -1]
const COL_DELTAS: [i32; 4] = [0, 1, 0, -1];

/// Path Verification Guest Program with Proof Composition (Hash-Based)
///
/// This program verifies a player's path through a maze by:
/// 1. Verifying the maze generation proof (using env::verify)
/// 2. Reading the maze grid from host as untrusted input
/// 3. Hashing the grid and verifying it matches the committed hash
/// 4. Validating the grid structure (start/end positions are paths)
/// 5. Verifying the player's path is valid
///
/// SECURITY MODEL:
/// - Maze generation proof commits to a SHA-256 hash of the grid
/// - Grid is provided as untrusted input and verified via hash comparison
/// - This proves the grid matches the verified maze without embedding it in the proof
/// - Path verification ensures:
///   * Fixed start position (1, 1)
///   * Sequential movement validation (only +/-1 per move)
///   * Valid move directions (0-3 only)
///   * Bounds checking (all positions < GRID_SIZE)
///   * Wall collision detection (all positions are path cells)
///   * Goal achievement (must reach end_pos, end_pos)
///
/// PROOF COMPOSITION:
/// - The maze receipt is verified using env::verify()
/// - This creates an "assumption" that's resolved during succinct proof generation
/// - Hash comparison proves the grid matches the verified maze
/// - The final receipt proves both maze generation AND path validity
///
/// PERFORMANCE:
/// - SHA-256 verification cost: ~1,842 cycles (negligible)
/// - Journal size reduction: 97.9% (1,685 bytes → 36 bytes)

fn main() {
    // Read the maze receipt image ID (32 bytes)
    // This identifies which guest program generated the maze
    let mut maze_image_id_bytes = [0u8; 32];
    env::read_slice(&mut maze_image_id_bytes);
    let maze_image_id = Digest::try_from(maze_image_id_bytes.as_slice())
        .expect("Invalid image ID format");

    // Read the maze receipt journal (seed + grid_hash)
    let mut maze_journal_bytes = [0u8; MAZE_JOURNAL_SIZE];
    env::read_slice(&mut maze_journal_bytes);

    // Parse maze journal
    let maze_seed = u32::from_le_bytes([
        maze_journal_bytes[0],
        maze_journal_bytes[1],
        maze_journal_bytes[2],
        maze_journal_bytes[3],
    ]);

    let mut committed_hash = [0u8; 32];
    committed_hash.copy_from_slice(&maze_journal_bytes[4..MAZE_JOURNAL_SIZE]);

    // Verify the maze receipt
    // This adds an assumption to our proof that will be resolved later
    // The assumption states: "I verified a proof with this image_id and journal"
    env::verify(maze_image_id, &maze_journal_bytes)
        .expect("Failed to verify maze receipt");

    // Read the grid data as untrusted input from the host
    let mut grid_data = [0u8; GRID_DATA_SIZE];
    env::read_slice(&mut grid_data);

    // Hash the provided grid and verify it matches the committed hash
    // This proves the grid corresponds to the verified maze
    // Cost: 6 + 68 × 27 = 1,842 cycles (negligible overhead)
    let hash_digest = SHA256::hash_bytes(&grid_data);
    let hash_bytes = hash_digest.as_bytes();

    let mut computed_hash = [0u8; 32];
    computed_hash.copy_from_slice(hash_bytes);

    // SECURITY: Verify hash matches
    if computed_hash != committed_hash {
        // Grid doesn't match the verified maze - reject
        let output = PathJournal {
            is_valid: 0,
            maze_seed,
        };
        env::commit(&output.is_valid);
        env::commit(&output.maze_seed);
        return;
    }

    // Convert flat grid data to 2D array for verification
    let mut grid = [[0u8; 41]; 41];
    for i in 0..GRID_SIZE {
        for j in 0..GRID_SIZE {
            grid[i][j] = grid_data[i * GRID_SIZE + j];
        }
    }

    // SECURITY: Validate start and end positions are paths
    let start_pos = 1;
    let end_pos = GRID_SIZE - 2;
    if grid[start_pos][start_pos] != 1 || grid[end_pos][end_pos] != 1 {
        // Start or end position is not a path - invalid maze
        let output = PathJournal {
            is_valid: 0,
            maze_seed,
        };
        env::commit(&output.is_valid);
        env::commit(&output.maze_seed);
        return;
    }

    // Read the player's moves
    let move_count: u16 = env::read();

    // SECURITY: Reject if move count exceeds maximum
    // This prevents attempting to read more data than our buffer can hold
    if move_count > MAX_MOVES as u16 {
        let output = PathJournal {
            is_valid: 0,
            maze_seed,
        };
        env::commit(&output.is_valid);
        env::commit(&output.maze_seed);
        return;
    }

    let mut moves = [0u8; MAX_MOVES];
    let actual_move_count = move_count as usize;
    if actual_move_count > 0 {
        env::read_slice(&mut moves[..actual_move_count]);
    }

    // Verify the solution with the verified maze
    // start_pos and end_pos already defined above (lines 79-80)
    let is_valid = verify_maze_solution(&moves, &grid, GRID_SIZE, start_pos, end_pos);

    // Commit results to journal
    let output = PathJournal {
        is_valid: if is_valid { 1 } else { 0 },
        maze_seed,
    };

    env::commit(&output.is_valid);
    env::commit(&output.maze_seed);
}

fn verify_maze_solution(
    moves: &[u8],
    grid: &[[u8; 41]; 41], // Fixed-size array for optimal performance
    grid_size: usize,
    start_pos: usize,
    end_pos: usize,
) -> bool {
    // Start position
    let mut row = start_pos;
    let mut col = start_pos;
    let mut has_reached_end = false;

    // Validate starting position is on a path
    if grid[row][col] != 1 {
        return false;
    }

    // Process moves until we reach the end
    // OPTIMIZATION: Early termination - stop processing once goal is reached
    for i in 0..moves.len() {
        if has_reached_end {
            break;
        }

        let direction = moves[i];

        // SECURITY: Validate direction is in valid range [0, 3]
        // Invalid directions fail verification rather than defaulting to a valid move
        if direction > 3 {
            return false;  // Invalid move direction
        }

        // OPTIMIZATION: Use lookup tables for direction deltas
        let dir_idx = direction as usize;
        let row_delta = ROW_DELTAS[dir_idx];
        let col_delta = COL_DELTAS[dir_idx];

        // Compute next position with checked arithmetic
        let next_row = (row as i32).wrapping_add(row_delta) as usize;
        let next_col = (col as i32).wrapping_add(col_delta) as usize;

        // SECURITY: Bounds check prevents out-of-bounds access
        if next_row >= grid_size || next_col >= grid_size {
            return false;
        }

        // SECURITY: Wall check ensures valid path
        if grid[next_row][next_col] != 1 {
            return false;
        }

        // Update position
        row = next_row;
        col = next_col;

        // Check if we've reached the end
        if row == end_pos && col == end_pos {
            has_reached_end = true;
        }
    }

    // SECURITY: Final validation ensures goal was reached
    has_reached_end
}
