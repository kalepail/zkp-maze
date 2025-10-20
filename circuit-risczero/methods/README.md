# RISC Zero Guest Programs

Guest programs that run inside the RISC Zero zkVM to generate cryptographic proofs.

## Overview

This directory contains two guest programs that implement the two-stage proof architecture:

1. **`maze-gen/`** - Generates a maze from a seed and commits a hash to the journal
2. **`path-verify/`** - Verifies a player's path through a maze using proof composition

## Guest Programs

### maze-gen (Stage 1)

**Purpose:** Prove that a maze was correctly generated from a seed.

**Location:** `methods/maze-gen/src/main.rs`

**Inputs:**
- `maze_seed: u32` - Seed for deterministic maze generation

**Processing:**
1. Generate maze using `Maze::generate()` from `maze-core`
2. Convert to binary grid (41×41 array)
3. Compute SHA-256 hash of grid
4. Commit seed + hash to journal (36 bytes)

**Outputs (Journal):**
- `maze_seed: u32` (4 bytes)
- `grid_hash: [u8; 32]` (32 bytes)
- **Total: 36 bytes** (97.9% smaller than previous 1,685 bytes)

**Why hash-based?**
- Minimizes journal size following RISC Zero best practices
- SHA-256 costs only ~1,842 cycles (~0.04% overhead)
- Grid data stored separately by host for visualization/verification

### path-verify (Stage 2)

**Purpose:** Prove that a player's moves successfully navigate a verified maze.

**Location:** `methods/path-verify/src/main.rs`

**Inputs:**
- `maze_image_id: [u8; 32]` - ID of maze-gen guest program
- `maze_journal: [u8; 36]` - Journal from maze-gen proof (seed + hash)
- `grid_data: [u8; 1681]` - Grid to verify (untrusted input)
- `move_count: u16` - Number of moves
- `moves: [u8; move_count]` - Player's moves

**Processing:**
1. Verify maze receipt using `env::verify(maze_image_id, maze_journal)`
2. Hash provided grid and verify it matches committed hash
3. Validate grid structure (start/end positions are paths)
4. Verify player's path:
   - Start at (1, 1)
   - Each move valid (no walls, in bounds)
   - End at (39, 39)
5. Commit result to journal

**Outputs (Journal):**
- `is_valid: u32` - 1 if valid, 0 if invalid
- `maze_seed: u32` - Maze identifier

**Proof Composition:**
The `env::verify()` call creates an "assumption" in the proof that's resolved by the host via `add_assumption()`. The final receipt proves:
1. The maze was correctly generated (via verified receipt)
2. The grid matches the maze (via hash verification)
3. The path is valid (via move validation)

## Architecture

```
methods/
├── Cargo.toml              # Workspace defining both guest programs
├── build.rs                # Build script for guest program compilation
├── src/
│   └── lib.rs              # Exports MAZE_GEN_ELF, MAZE_GEN_ID, PATH_VERIFY_ELF, PATH_VERIFY_ID
├── maze-gen/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs         # Maze generation guest (72 lines)
└── path-verify/
    ├── Cargo.toml
    └── src/
        └── main.rs         # Path verification guest (224 lines)
```

## How Guest Programs Work

### Entry Point

Each guest program uses:
```rust
#![no_main]
#![no_std]

risc0_zkvm::guest::entry!(main);

fn main() {
    // Guest code here
}
```

### Reading Inputs

```rust
use risc0_zkvm::guest::env;

// Read typed data
let seed: u32 = env::read();

// Read slices
let mut buffer = [0u8; 32];
env::read_slice(&mut buffer);
```

### Writing Outputs (Journal)

```rust
// Commit typed data
env::commit(&value);

// Commit slices
env::commit_slice(&bytes);
```

### Verifying Other Proofs

```rust
use risc0_zkvm::sha::Digest;

let image_id = Digest::try_from(image_id_bytes.as_slice()).unwrap();
env::verify(image_id, journal_bytes).expect("Failed to verify");
```

## Building Guest Programs

Guest programs are automatically built when you build the workspace:

```bash
cd /Users/kalepail/Desktop/noir-maze-challenge/circuit-risczero
cargo build --release
```

This generates:
- `MAZE_GEN_ELF` - Guest program binary
- `MAZE_GEN_ID` - Program image ID (hash of ELF)
- `PATH_VERIFY_ELF` - Guest program binary
- `PATH_VERIFY_ID` - Program image ID

These are exposed by `methods/src/lib.rs` for use by the host.

## Code Organization

### maze-gen/src/main.rs

```rust
use maze_core::{Maze, MAZE_ROWS, MAZE_COLS, MazeJournal};
use risc0_zkvm::sha::{Impl as SHA256, Sha256};

fn main() {
    let seed = env::read();

    // Generate maze using shared core logic
    let maze = Maze::generate(MAZE_ROWS, MAZE_COLS, seed);
    let grid = maze.to_binary_grid();

    // Hash grid
    let hash = SHA256::hash_bytes(&grid_bytes);

    // Commit to journal
    env::commit(&seed);
    env::commit_slice(&hash);
}
```

### path-verify/src/main.rs

```rust
use maze_core::{PathJournal, MAX_MOVES, GRID_SIZE};

fn main() {
    // Read inputs
    let maze_image_id = read_image_id();
    let maze_journal = read_maze_journal();
    let grid_data = read_grid_data();
    let moves = read_moves();

    // Verify maze proof
    env::verify(maze_image_id, &maze_journal).expect("Maze proof invalid");

    // Hash grid and verify
    let computed_hash = SHA256::hash_bytes(&grid_data);
    assert_eq!(computed_hash, committed_hash);

    // Verify path
    let is_valid = verify_maze_solution(&moves, &grid, ...);

    // Commit result
    env::commit(&(is_valid as u32));
    env::commit(&maze_seed);
}
```

## Shared Code (maze-core)

Both guest programs import from the `maze-core` crate:

```toml
[dependencies]
maze-core = { path = "../../core" }
risc0-zkvm = { version = "^3.0.3", default-features = false, features = ['std'] }
```

This ensures:
- **Identical maze generation** between guest and host
- **No code duplication** (360 lines eliminated)
- **Guaranteed determinism** - same seed = same maze

## Performance

**Maze Generation:**
- Total cycles: ~50,000-75,000
- RNG: ~2,400-4,000 cycles
- Maze algorithm: ~10,000-15,000 cycles
- SHA-256 hashing: ~1,842 cycles
- Proving time: ~45 seconds

**Path Verification:**
- Maze receipt verification: minimal (assumption)
- Hash verification: ~1,842 cycles
- Path validation: ~100-500 cycles per move
- Proving time: ~22-45 seconds

## Security Model

### maze-gen Security

**Guarantees:**
- Maze generated using documented algorithm (recursive backtracker)
- RNG is deterministic (Park-Miller LCG with known multiplier/modulus)
- Grid hash cryptographically commits to maze configuration

**Trust assumptions:**
- Host correctly regenerates grid (but hash verification in path-verify catches any mismatch)

### path-verify Security

**Guarantees:**
- Maze proof is valid (verified via `env::verify()`)
- Grid matches verified maze (hash comparison)
- Start position is (1, 1)
- End position is (39, 39)
- All moves are valid (no walls, in bounds, valid directions)
- Path reaches the goal

**Attack resistance:**
- Invalid directions (>3) result in verification failure
- Wall collisions result in verification failure
- Out-of-bounds moves result in verification failure
- Mismatched grid hash results in verification failure

## Development

### Modifying Guest Programs

1. Edit `maze-gen/src/main.rs` or `path-verify/src/main.rs`
2. Rebuild: `cargo build --release`
3. Test: `cargo test --release`

### Adding New Guest Programs

1. Create new directory: `methods/new-guest/`
2. Add to workspace in `methods/Cargo.toml`:
   ```toml
   [workspace]
   members = ["maze-gen", "path-verify", "new-guest"]
   ```
3. Update `methods/build.rs` to include new guest
4. Export constants in `methods/src/lib.rs`

### Debugging Guest Programs

Enable logging:
```bash
RISC0_DEV_MODE=1 RUST_LOG=info cargo run --release
```

Note: Dev mode skips proving for faster iteration but doesn't generate real proofs.

## Testing

Guest programs are tested via integration tests in `host/tests/integration_test.rs`:

```bash
cargo test --release
```

The integration tests verify:
- Valid solutions are accepted
- Invalid solutions are rejected
- Different error conditions (empty moves, wrong seed, etc.)

## Resources

- [RISC Zero Guest Code Guide](https://dev.risczero.com/zkvm/developer-guide/guest-code-101)
- [Journal Documentation](https://dev.risczero.com/zkvm/developer-guide/receipts)
- [Proof Composition](https://dev.risczero.com/zkvm/composition)
- [SHA-256 in zkVM](https://dev.risczero.com/zkvm/developer-guide/cryptography)
- [Parent README](../README.md) - Full system documentation
