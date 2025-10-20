use host::{generate_maze_proof, verify_path_proof, ReceiptKind};

/// The known maze seed for testing
const MAZE_SEED: u32 = 2918957128;

/// Full 312-move BFS solution for the test maze
/// Directions: 0=NORTH, 1=EAST, 2=SOUTH, 3=WEST
const TEST_MOVES: &[u8] = &[
    1, 1, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1,
    1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 1, 1, 0, 0, 3, 3, 0, 0, 0, 0, 3, 3, 3, 3,
    0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2,
    3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
    0, 0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2,
    2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 3, 3, 3,
    2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 0, 0, 3, 3, 0, 0, 1, 1, 0, 0,
    3, 3, 3, 3, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2,
    1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 3, 3,
    3, 3, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1,
];

#[test]
fn test_valid_bfs_solution() {
    println!("🧪 Testing valid BFS solution...");

    // Generate maze proof once (use Composite for faster test execution)
    let maze_proof = generate_maze_proof(MAZE_SEED, ReceiptKind::Composite).expect("Maze proof generation failed");

    // Verify the path
    let moves = TEST_MOVES.to_vec();
    let result = verify_path_proof(&maze_proof, moves, None).expect("Path verification failed");

    assert!(
        result.is_valid,
        "BFS solution should be valid but got invalid"
    );
    assert_eq!(
        result.maze_seed, MAZE_SEED,
        "Maze seed should match input"
    );

    println!("✅ Valid BFS solution test passed!");
}

#[test]
fn test_invalid_solution_empty_moves() {
    println!("🧪 Testing empty moves (should be invalid)...");

    // Generate maze proof once (use Composite for faster test execution)
    let maze_proof = generate_maze_proof(MAZE_SEED, ReceiptKind::Composite).expect("Maze proof generation failed");

    // Verify with empty moves
    let moves = vec![];
    let result = verify_path_proof(&maze_proof, moves, None).expect("Path verification failed");

    assert!(
        !result.is_valid,
        "Empty moves should be invalid but got valid"
    );

    println!("✅ Empty moves test passed!");
}

#[test]
fn test_invalid_solution_wrong_seed() {
    println!("🧪 Testing wrong seed (should be invalid)...");

    // Generate maze proof with different seed (use Composite for faster test execution)
    let wrong_seed = 12345;
    let maze_proof = generate_maze_proof(wrong_seed, ReceiptKind::Composite).expect("Maze proof generation failed");

    // Verify with moves designed for different maze
    let moves = TEST_MOVES.to_vec();
    let result = verify_path_proof(&maze_proof, moves, None).expect("Path verification failed");

    assert!(
        !result.is_valid,
        "Wrong seed should be invalid but got valid"
    );

    println!("✅ Wrong seed test passed!");
}

#[test]
fn test_partial_solution() {
    println!("🧪 Testing partial solution (should be invalid)...");

    // Generate maze proof once (use Composite for faster test execution)
    let maze_proof = generate_maze_proof(MAZE_SEED, ReceiptKind::Composite).expect("Maze proof generation failed");

    // Only take first 50 moves (won't reach the end)
    let moves = TEST_MOVES[..50].to_vec();
    let result = verify_path_proof(&maze_proof, moves, None).expect("Path verification failed");

    assert!(
        !result.is_valid,
        "Partial solution should be invalid but got valid"
    );

    println!("✅ Partial solution test passed!");
}

#[test]
fn test_invalid_moves() {
    println!("🧪 Testing invalid moves (should be invalid)...");

    // Generate maze proof once (use Composite for faster test execution)
    let maze_proof = generate_maze_proof(MAZE_SEED, ReceiptKind::Composite).expect("Maze proof generation failed");

    // Try to walk through walls with random moves
    let moves = vec![1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    let result = verify_path_proof(&maze_proof, moves, None).expect("Path verification failed");

    assert!(
        !result.is_valid,
        "Invalid moves should be invalid but got valid"
    );

    println!("✅ Invalid moves test passed!");
}
