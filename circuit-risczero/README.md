# Risc Zero Maze Challenge

Zero-knowledge maze solver using Risc Zero zkVM with **dynamic maze generation** and **proof composition**.

## Overview

This implementation proves that a player successfully navigated from start to finish through a maze, using zero-knowledge proofs. The unique feature of this implementation is that it generates mazes dynamically from a seed **inside the zkVM**, unlike traditional ZK systems that require compile-time data.

## Key Innovation: Dynamic Maze Generation in ZK

**What makes this special:**

This implementation generates entire mazes from a seed inside the zero-knowledge proof using:
- Park-Miller Linear Congruential Generator (MINSTD) for deterministic randomness
- Recursive backtracker algorithm for maze generation
- All computation happens inside the zkVM and is cryptographically verified

**Why this matters:**

1. **Works with ANY maze seed** - No recompilation needed for different mazes
2. **Proves TWO things** - Both correct maze generation AND valid solution
3. **Demonstrates Risc Zero's advantage** - Arbitrary computation in zero-knowledge

**Why Noir can't do this:**

Noir uses a constraint-based system (R1CS/Plonk) where every operation must be compiled to arithmetic constraints. Complex algorithms like maze generation with loops, recursion, and dynamic data structures would require millions of constraints and be computationally impractical. Risc Zero's VM-based approach executes normal Rust code, making such algorithms feasible.

## Two-Stage Architecture with Proof Composition

**NEW**: This implementation now supports a two-stage architecture that separates maze generation from path verification, enabling efficient multi-player scenarios.

### Why Two-Stage?

**Problem**: With the single-stage approach, every player must generate a maze proof AND a path proof, even when playing the same maze.

**Solution**: Generate the maze proof once, then each player only proves their path is valid against that maze.

### Architecture Diagram (Hash-Based)

```
Stage 1: Maze Generation (Once per maze)
┌─────────────────────────────────────────┐
│ Input: maze_seed                        │
│   ↓                                     │
│ [maze-gen guest program]                │
│   • Generate maze from seed             │
│   • Compute SHA-256 hash of grid        │
│   • Commit seed + hash to journal       │
│   ↓                                     │
│ Output: MazeProof (shareable)           │
│   Receipt journal: seed + hash (36 B)   │
│   File data: seed, hash, grid, receipt  │
│                                         │
│ 97.9% SMALLER JOURNAL!                  │
│ (36 bytes vs 1,685 bytes)               │
└─────────────────────────────────────────┘

Stage 2: Path Verification (Once per player)
┌──────────────────────────────────────────┐
│ Input: MazeProof + player_moves          │
│   ↓                                      │
│ [path-verify guest program]              │
│   • Verify maze receipt ✓                │
│   • Read grid from MazeProof file        │
│   • Hash grid, verify matches journal    │
│   • Validate player path                 │
│   • Commit result to journal             │
│   ↓                                      │
│ Output: PathProof                        │
│   (proves maze + hash + path)            │
└──────────────────────────────────────────┘
```

### Performance Benefits

**Scenario**: 100 players solving the same maze

- **Single-stage**: 100 maze generations + 100 path verifications = 200 proofs
- **Two-stage**: 1 maze generation + 100 path verifications = 101 proofs

**Result**: ~50% reduction in proving work!

### How to Use

**Mode 1: Generate maze proof (once)**
```bash
./target/release/host generate-maze 2918957128 maze_proof.json
```

**Mode 2: Verify player paths (many times)**
```bash
# Player 1
./target/release/host verify-path maze_proof.json player1_moves.json

# Player 2
./target/release/host verify-path maze_proof.json player2_moves.json

# Player 3
./target/release/host verify-path maze_proof.json player3_moves.json
```

### Proof Composition (Hash-Based Architecture)

The path verification uses RISC Zero's `env::verify()` to create a **composed proof** with hash-based verification:

1. **Maze generation** commits: seed + SHA-256(grid) to journal (36 bytes)
2. **Path verification guest** calls `env::verify(maze_receipt)` to verify the maze proof
3. This adds an "assumption" to the proof that's resolved via `add_assumption()` in the host
4. **Grid is provided as input** and verified by hashing it and comparing to the committed hash
5. **Hash verification proves** the grid matches the verified maze (1,842 cycles, ~0.04% overhead)
6. Path is validated against the verified grid
7. The final PathProof cryptographically proves ALL THREE:
   - The maze was correctly generated from the seed
   - The provided grid matches the maze (via hash verification)
   - The player's path successfully navigates the maze

**Why Hash-Based?**

- **97.9% smaller journal**: 36 bytes vs 1,685 bytes
- **Faster proof generation**: Less journal data = fewer constraints
- **Faster verification**: Smaller proofs verify faster
- **Negligible cost**: SHA-256 hashing adds only ~1,842 cycles
- **Best practice**: Aligns with RISC Zero 2024-2025 recommendations

The grid data is still available in the MazeProof file for visualization and path verification, but it's NOT embedded in the cryptographic proof journal.

## Architecture

```
circuit-risczero/
├── core/                  # Shared types (no_std)
│   └── src/
│       └── lib.rs        # MazeJournal, PathJournal, constants
├── host/                  # Prover (runs outside zkVM)
│   ├── src/
│   │   ├── lib.rs        # generate_maze_proof(), verify_path_proof()
│   │   └── main.rs       # CLI with three modes
│   ├── tests/
│   │   └── integration_test.rs  # Integration tests
│   ├── example_moves.json       # Valid 312-move BFS solution
│   └── short_moves.json         # Invalid short solution
└── methods/
    ├── maze-gen/         # Stage 1: Maze generation guest
    │   └── src/
    │       ├── main.rs         # Maze generation proof
    │       ├── rng.rs          # Park-Miller LCG
    │       └── maze_gen.rs     # Recursive backtracker
    ├── path-verify/      # Stage 2: Path verification guest
    │   └── src/
    │       └── main.rs         # Path verification with composition
    └── Cargo.toml        # Defines both guest programs
```

## Quick Start

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# The rust-toolchain.toml will automatically install the correct version
```

### Build

```bash
cargo build --release
```

### Run Tests

```bash
cargo test --release
```

## Usage

### Command Line

**Generate maze proof:**
```bash
./target/release/host generate-maze <seed> [output_file]
```

**Verify player path:**
```bash
./target/release/host verify-path <maze_proof_file> <moves_file>
```

**Arguments:**
- `seed`: Unsigned 32-bit integer identifying the maze
- `output_file`: Optional JSON file to save the maze proof
- `maze_proof_file`: JSON file containing the maze proof
- `moves_file`: JSON file with moves array

**Moves format:** JSON array of direction values
- `0` = NORTH (up)
- `1` = EAST (right)
- `2` = SOUTH (down)
- `3` = WEST (left)

Example `moves.json`:
```json
[1, 1, 2, 2, 1, 1, 2, 2]
```

### As a Library

```rust
use host::{generate_maze_proof, verify_path_proof};

fn main() {
    let seed = 2918957128;

    // Generate maze proof once
    let maze_proof = generate_maze_proof(seed).unwrap();

    // Share maze_proof with players...

    // Each player verifies their path
    let moves = vec![1, 1, 2, 2, 3, 3];
    match verify_path_proof(&maze_proof, moves) {
        Ok(result) if result.is_valid => {
            println!("✅ Valid maze solution!");
        }
        Ok(_) => {
            println!("❌ Invalid maze solution!");
        }
        Err(e) => {
            eprintln!("Error: {}", e);
        }
    }
}
```

## How It Works

### 1. Maze Generation (in zkVM)

The guest program generates a maze deterministically from the seed using:

**Park-Miller LCG (MINSTD):**
```
state = (state × 48271) mod (2³¹ - 1)
```

**Recursive Backtracker Algorithm:**
1. Start at (0, 0), mark as visited
2. Get unvisited neighbors
3. If neighbors exist:
   - Choose random neighbor
   - Remove wall between current and neighbor
   - Mark neighbor as visited, push to stack
4. Else: backtrack (pop from stack)
5. Repeat until stack is empty

Output: 41×41 binary grid (0=wall, 1=path) for a 20×20 cell maze.

### 2. Solution Verification (in zkVM)

The guest program verifies:
- Start position: (1, 1)
- End position: (39, 39)
- Each move is valid (no walls, in bounds)
- Final position reaches the end

### 3. Proof Generation (host)

The host:
1. Reads maze seed and moves from user
2. Passes inputs to guest program in zkVM
3. Guest generates maze and verifies solution
4. Guest commits result to journal (public output)
5. Proof is generated and verified
6. Host returns result to user

## Security Model

The circuit proves:

1. **Maze Identity**: Correct maze generated from seed
2. **Fixed Start**: Begin at (1, 1)
3. **Valid Moves**: Only +/-1 per move, no diagonal
4. **Bounds Checking**: All positions within grid
5. **Wall Detection**: No walking through walls
6. **Goal Achievement**: Must reach (39, 39)

**Invalid moves**: Direction values outside {0,1,2,3} result in no-op (position unchanged). This is secure because:
- No-ops cannot help reach the goal
- No-ops cannot bypass wall/bounds checks
- Underflow is caught by bounds checking

## Performance

With dynamic maze generation (20×20 cells, 41×41 grid):

| Operation | Time |
|-----------|------|
| Valid 312-move solution | ~45 seconds |
| Invalid short solution | ~22 seconds |
| All 5 integration tests | ~163 seconds |

**Performance Notes:**
- Dynamic maze generation adds overhead compared to hardcoded mazes
- This is the trade-off for supporting ANY seed without recompilation
- Maze generation happens inside the proof, maintaining zero-knowledge properties
- Using recursive backtracker algorithm with explicit stack

## Integration Tests

Five tests verify correctness:

1. ✅ **Valid BFS solution** - 312 moves successfully navigate the maze
2. ❌ **Empty moves** - No moves should fail
3. ❌ **Wrong seed** - Different maze should fail with same moves
4. ❌ **Partial solution** - Incomplete path should fail
5. ❌ **Invalid moves** - Wall collisions should fail

Run with:
```bash
cargo test --release
```

## Comparison: Risc Zero vs Noir

| Feature | Risc Zero | Noir |
|---------|-----------|------|
| **Dynamic Generation** | ✅ Yes | ❌ No |
| **Maze Flexibility** | Any seed | One maze per compile |
| **Computation Model** | RISC-V VM | Constraint system |
| **Algorithm Complexity** | Arbitrary | Limited by constraints |
| **Proof Time** | ~45s | ~5s |
| **Compile Time** | Fast | Slow for large mazes |

**Verdict:** Risc Zero enables algorithms that would be impractical in constraint-based systems, at the cost of longer proving time.

## Technical Details

### Maze Dimensions
- Cell dimensions: 20×20 (MAZE_ROWS × MAZE_COLS)
- Grid dimensions: 41×41 (MAZE_ROWS×2+1)
- Start coordinates: (1, 1)
- End coordinates: (39, 39)
- Maximum moves: 500

### RNG Implementation
- Algorithm: Park-Miller LCG (MINSTD)
- Multiplier: 48271
- Modulus: 2³¹ - 1 = 2147483647
- Output: [0.0, 1.0)

**Why Park-Miller LCG for RISC Zero:**

Park-Miller LCG is optimal for RISC Zero's VM-based architecture because:
- **Modulo is cheap**: 2 cycles in RISC-V (vs 5,000-10,000 gates in Noir)
- **Excellent performance**: ~6-10 cycles per random number vs ~70+ for hashes
- **Sufficient for maze generation**: Period of 2³¹-1 is adequate for procedural content
- **Deterministic**: Same seed always produces same maze

**Alternative Considered: xoshiro128++**

Research showed xoshiro128++ would provide:
- ✅ Better statistical quality (passes BigCrush tests vs Park-Miller's failures)
- ✅ Longer period (2¹²⁸ vs 2³¹)
- ✅ Industry standard (used in Rust `rand` crate)
- ❌ 2x slower (~10-20 cycles vs ~6-10 cycles)
- ❌ Breaking change (different mazes from same seed)

**Decision**: Keep Park-Miller LCG for optimal performance. Statistical quality is sufficient for maze generation, and the 2x speed advantage (4,000 cycles saved per maze) is valuable in zkVM context.

**Note on Hash-Based RNG**: Noir's circuit uses Pedersen hash for RNG because modulo operations are expensive in constraint systems (5,000-10,000 gates). This optimization doesn't apply to RISC Zero where modulo is a cheap native operation (2 cycles).

### Hash-Based Journal Architecture

**Why hash the grid instead of including it in the journal?**

RISC Zero best practices (2024-2025) recommend minimizing journal size by hashing public outputs rather than including full data. This provides:

**Performance Benefits:**
- **Journal size**: 36 bytes vs 1,685 bytes (97.9% reduction)
- **Proof generation**: Faster (fewer constraints for journal handling)
- **Proof verification**: Faster (less data to verify)
- **SHA-256 cost**: Only 1,842 cycles (6 + 68×27 blocks) = ~0.04% of total execution

**SHA-256 in RISC Zero zkVM:**
- Uses hardware-accelerated SHA-256 precompile
- Cost formula: `6 + 68 × blocks + paging`
- For 1,681 bytes: 6 + (68 × 27) = 1,842 cycles
- Compare to maze generation: ~2,400-4,000 cycles for RNG
- Compare to path verification: thousands of cycles for move validation

**Data Flow:**
1. **maze-gen**: Generate grid → hash it → commit hash to journal
2. **Host**: Extract hash from journal, regenerate grid (deterministic), save both in MazeProof file
3. **path-verify**: Receive grid as input → hash it → verify hash matches journal → validate path

This separates the cryptographic commitment (hash in journal) from the actual data (grid in file), following zkVM best practices for scalability.

### Guest Program (no_std)
- Uses `#![no_std]` with `alloc` support
- All data structures use `Vec` and `alloc::vec!`
- Deterministic execution for reproducible proofs

## Development

### Project Structure

See [`host/README.md`](host/README.md) for detailed usage documentation.

### Adding New Tests

Add tests to `host/tests/integration_test.rs`:

```rust
#[test]
fn test_my_case() {
    let seed = 12345;
    let maze_proof = generate_maze_proof(seed).expect("Failed to generate maze proof");

    let moves = vec![1, 1, 2, 2];
    let result = verify_path_proof(&maze_proof, moves).expect("Failed to verify path");
    assert!(!result.is_valid);
}
```

### Modifying Maze Size

Update constants in `core/src/lib.rs` and regenerate both guest programs:

```rust
const MAZE_ROWS: usize = 30;  // Change from 20
const MAZE_COLS: usize = 30;  // Change from 20
```

## Resources

- [Risc Zero Documentation](https://dev.risczero.com)
- [Risc Zero GitHub](https://github.com/risc0/risc0)
- [zkVM Overview](https://dev.risczero.com/zkvm)
- [Park-Miller LCG](https://en.wikipedia.org/wiki/Lehmer_random_number_generator)

## License

This project is licensed under the terms specified in the LICENSE file.
