mod rng;
mod maze;

use maze::{generate_maze, GRID_SIZE};
use dep::std::hash::pedersen_hash;

// Hash the maze grid for compact public output
// Flattens 41x41 u8 array and hashes it to a single Field element
fn hash_maze(maze: [[u8; GRID_SIZE]; GRID_SIZE]) -> Field {
    // Flatten the 2D array into a 1D array of Field elements
    // We'll hash in chunks since pedersen_hash works with arrays
    let mut hash_input: [Field; GRID_SIZE * GRID_SIZE] = [0; GRID_SIZE * GRID_SIZE];

    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            hash_input[row * GRID_SIZE + col] = maze[row][col] as Field;
        }
    }

    // Hash the flattened array
    // Note: This is a simplified approach. In production, you'd want to hash in chunks
    // For now, we'll hash the entire array at once
    pedersen_hash(hash_input)
}

// EXPERIMENT: Hash output variant (uncomment to reduce verification time)
// NOTE: This INCREASES gate count by ~251k (3%) due to hashing cost
// But reduces verification time by ~60-90% due to smaller public output
// fn main(seed: pub u32) -> pub Field {
//     let maze = generate_maze(seed);
//     hash_maze(maze)
// }

// Main function - takes seed as input, outputs maze grid
fn main(seed: pub u32) -> pub [[u8; GRID_SIZE]; GRID_SIZE] {
    generate_maze(seed)
}

// Test with known seed to compare against Python output
#[test]
fn test_known_seed() {
    // Use the same seed as the current maze: 2918957128
    let seed: u32 = 2918957128;
    let maze = main(seed);

    // Verify it's a valid maze structure
    // - Start position (1,1) should be open
    assert(maze[1][1] == 1, "Start position should be open");

    // - End position (39,39) should be open
    assert(maze[39][39] == 1, "End position should be open");

    // - All borders should be walls (0)
    for i in 0..GRID_SIZE {
        assert(maze[0][i] == 0, "Top border should be wall");
        assert(maze[GRID_SIZE - 1][i] == 0, "Bottom border should be wall");
        assert(maze[i][0] == 0, "Left border should be wall");
        assert(maze[i][GRID_SIZE - 1] == 0, "Right border should be wall");
    }

    // - Grid size should be 41x41
    assert(GRID_SIZE == 41, "Grid should be 41x41");
}

// Test that different seeds produce different mazes
#[test]
fn test_different_seeds() {
    let maze1 = main(12345);
    let maze2 = main(67890);

    // At least one cell should be different
    let mut found_difference = false;

    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            if maze1[row][col] != maze2[row][col] {
                found_difference = true;
            }
        }
    }

    assert(found_difference, "Different seeds should produce different mazes");
}

// Test that same seed produces same maze (determinism)
#[test]
fn test_determinism() {
    let seed: u32 = 99999;
    let maze1 = main(seed);
    let maze2 = main(seed);

    // All cells should be identical
    for row in 0..GRID_SIZE {
        for col in 0..GRID_SIZE {
            assert(maze1[row][col] == maze2[row][col], "Same seed should produce identical maze");
        }
    }
}
