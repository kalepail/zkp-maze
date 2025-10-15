# Risc Zero Host Program

This host program generates zero-knowledge proofs for maze solutions using Risc Zero zkVM.

## Key Features

**Dynamic Maze Generation**: Unlike the Noir implementation which requires compile-time maze data, this implementation generates mazes dynamically from a seed inside the zkVM. This means:
- Works with any maze seed without recompilation
- Proves correct maze generation AND solution in a single proof
- Demonstrates Risc Zero's advantage: arbitrary computation in ZK

This is possible because Risc Zero executes a full RISC-V VM, allowing complex algorithms like maze generation to run inside the proof, whereas Noir's constraint-based system makes this computationally impractical.

## Structure

- **`src/lib.rs`**: Reusable `prove_maze()` library function
- **`src/main.rs`**: CLI entry point for proving maze solutions
- **`tests/integration_test.rs`**: Integration tests with known valid/invalid solutions
- **`example_moves.json`**: Example moves file for CLI testing

## Usage

### CLI

```bash
# Run with custom moves
cargo run --release -- <maze_seed> <moves_file>

# Example
cargo run --release -- 2918957128 example_moves.json
```

**Arguments:**
- `maze_seed`: The seed identifying the maze (e.g., 2918957128)
- `moves_file`: Path to JSON file containing moves array

**Moves format:** JSON array of u8 direction values
- `0` = NORTH
- `1` = EAST
- `2` = SOUTH
- `3` = WEST

### As a Library

```rust
use host::prove_maze;

fn main() {
    let moves = vec![1, 1, 2, 2, 3, 3]; // EAST, EAST, SOUTH, SOUTH, WEST, WEST
    let result = prove_maze(2918957128, moves).unwrap();

    if result.is_valid {
        println!("✅ Maze solution is valid!");
    } else {
        println!("❌ Maze solution is invalid!");
    }
}
```

### Running Tests

```bash
# Run all tests
cargo test --release

# Run specific test
cargo test --release test_valid_bfs_solution

# Run with output
cargo test --release -- --nocapture
```

## Examples

### Valid Solution (example_moves.json)
The provided `example_moves.json` contains a complete 312-move BFS solution that successfully navigates from start to end.

```bash
cargo run --release -- 2918957128 example_moves.json
# Output: 🎊 Congratulations! Your maze solution is cryptographically verified!
```

### Invalid Solution (short_moves.json)
A short sequence that doesn't reach the end:

```json
[1, 1, 2, 2, 3, 3]
```

```bash
cargo run --release -- 2918957128 short_moves.json
# Output: ❌ The maze solution is invalid!
```

## Performance

With dynamic maze generation:
- **Valid 312-move solution**: ~45 seconds (includes maze generation in zkVM)
- **Invalid short solutions**: ~22 seconds
- **All 5 integration tests**: ~163 seconds (parallel execution)

Performance notes:
- Dynamic maze generation adds overhead compared to hardcoded mazes
- This is the trade-off for supporting any seed without recompilation
- The zkVM generates a 20×20 cell maze (41×41 grid) using Park-Miller LCG and recursive backtracker algorithm
- Generation happens inside the proof, maintaining zero-knowledge properties

## Integration Tests

Five integration tests verify:

1. **`test_valid_bfs_solution`**: 312-move BFS solution is valid ✅
2. **`test_invalid_solution_empty_moves`**: Empty moves array is invalid ❌
3. **`test_invalid_solution_wrong_seed`**: Wrong maze seed is invalid ❌
4. **`test_partial_solution`**: Incomplete path is invalid ❌
5. **`test_invalid_moves`**: Invalid move sequence is invalid ❌
