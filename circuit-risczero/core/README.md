# maze-core

Shared maze generation and cryptographic primitives for RISC Zero maze proofs.

## Overview

This crate provides the **single source of truth** for maze generation logic, RNG implementation, constants, and data types used across all components of the RISC Zero maze proof system.

**Key Feature:** `no_std` compatible with optional `std` feature for host-side convenience.

## Architecture

```
core/src/
├── lib.rs       # Constants, types (MazeJournal, PathJournal), re-exports
├── rng.rs       # Park-Miller LCG for deterministic randomness
└── maze_gen.rs  # Recursive backtracker maze generation algorithm
```

## Usage

### In Guest Programs (no_std)

```rust
// methods/maze-gen/src/main.rs
use maze_core::{Maze, MAZE_ROWS, MAZE_COLS};

let maze = Maze::generate(MAZE_ROWS, MAZE_COLS, seed);
let grid = maze.to_binary_grid(); // Returns [[u8; 41]; 41]
```

### In Host Programs (std)

```rust
// host/src/lib.rs
use maze_core::{Maze, MAZE_ROWS, MAZE_COLS};

let maze = Maze::generate(MAZE_ROWS, MAZE_COLS, seed);
let grid = maze.to_binary_grid_vec(); // Returns Vec<Vec<u8>>
```

The `to_binary_grid_vec()` method is only available with the `std` feature enabled.

## Features

### Default (no_std)
- Fixed-size array outputs
- No heap allocations in core logic
- Compatible with RISC Zero zkVM guest programs

### `std` Feature
- `Vec`-based API for JSON serialization
- Enabled in host program via `maze-core = { path = "../core", features = ["std"] }`

## Constants

```rust
pub const MAZE_ROWS: usize = 20;           // Maze dimensions (cells)
pub const MAZE_COLS: usize = 20;
pub const GRID_SIZE: usize = 41;            // MAZE_ROWS * 2 + 1 (includes walls)
pub const MAX_MOVES: usize = 500;           // Maximum moves in a solution
pub const GRID_DATA_SIZE: usize = 1681;     // GRID_SIZE * GRID_SIZE
pub const HASH_SIZE: usize = 32;            // SHA-256 hash size
pub const MAZE_JOURNAL_SIZE: usize = 36;    // seed (4) + hash (32)
```

## Types

### `MazeJournal`
Output committed to journal by maze generation proof:
```rust
pub struct MazeJournal {
    pub maze_seed: u32,
    pub grid_hash: [u8; 32],  // SHA-256 hash of grid
}
```

### `PathJournal`
Output committed to journal by path verification proof:
```rust
pub struct PathJournal {
    pub is_valid: u32,        // 0 or 1 (u32 for RISC Zero compatibility)
    pub maze_seed: u32,
}
```

## Modules

### `rng` - Park-Miller LCG

Deterministic random number generator matching the Python implementation.

**Key features:**
- Modulus: 2³¹ - 1 = 2,147,483,647
- Multiplier: 48,271
- Period: 2³¹ - 1 (all non-zero values)
- ~6-10 cycles per random number (RISC-V optimized)

**API:**
```rust
use maze_core::SimpleLCG;

let mut rng = SimpleLCG::new(seed);
let index = rng.choice_index(neighbor_count); // [0, len)
```

### `maze_gen` - Recursive Backtracker

Generates mazes using depth-first search with backtracking.

**Algorithm:**
1. Start at (0,0), mark as visited
2. While stack not empty:
   - Get unvisited neighbors
   - If neighbors exist: choose random neighbor, remove walls, push to stack
   - Else: backtrack (pop from stack)

**API:**
```rust
use maze_core::Maze;

let maze = Maze::generate(rows, cols, seed);

// Guest (no_std)
let grid_array = maze.to_binary_grid(); // [[u8; 41]; 41]

// Host (std)
let grid_vec = maze.to_binary_grid_vec(); // Vec<Vec<u8>>
```

**Output:** Binary grid where:
- `0` = wall
- `1` = path (walkable cell or open passage)
- Grid size: `(rows*2 + 1) × (cols*2 + 1)`

## Design Decisions

### Why Shared Code?

**Problem:** Originally, maze generation logic was duplicated:
- `methods/maze-gen/src/maze_gen.rs` (272 lines) - Guest implementation
- `methods/maze-gen/src/rng.rs` (157 lines) - Guest RNG
- `host/src/maze_regen.rs` (205 lines) - Host duplicate

**Total:** 634 lines of duplicated code with high divergence risk.

**Solution:** Single source of truth in `core/` crate:
- Shared between guest (no_std) and host (std)
- Feature flags for std/no_std variants
- Guaranteed identical behavior
- **360 lines eliminated**

### Why Park-Miller LCG?

**Advantages:**
- Modulo is cheap in RISC-V (2 cycles vs 5,000-10,000 gates in circuits)
- Fast: ~6-10 cycles per number
- Deterministic: same seed = same maze
- Sufficient quality for procedural generation

**Alternative considered:** xoshiro128++ would be higher quality but 2x slower and break compatibility.

### Why Feature Flags?

RISC Zero guest programs must be `no_std`, but host programs benefit from `std`:

- **Guest:** Uses fixed-size arrays `[[u8; 41]; 41]` for optimal zkVM performance
- **Host:** Uses `Vec<Vec<u8>>` for JSON serialization and flexibility

The `std` feature gate enables the `to_binary_grid_vec()` method without breaking no_std compatibility.

## Testing

Run core tests:
```bash
cargo test -p maze-core
```

**Test coverage:**
- RNG determinism and correctness
- Maze generation determinism
- Grid size validation
- std/no_std feature compatibility

## Dependencies

None - pure Rust implementation with zero external dependencies.

## Performance

**Maze Generation (20×20):**
- ~2,400-4,000 cycles for RNG calls
- ~10,000-15,000 cycles for recursive backtracker
- Deterministic grid regeneration on host: <1ms

**Hash Verification:**
- SHA-256 hashing: ~1,842 cycles
- Negligible overhead (~0.04% of total execution)

## Development

### Adding New Constants

Update `lib.rs`:
```rust
pub const NEW_CONSTANT: usize = 42;
```

Rebuild all dependent crates.

### Modifying Maze Algorithm

Edit `maze_gen.rs`, ensuring:
1. Determinism preserved (same seed = same maze)
2. Fixed-size arrays used (no heap allocations)
3. Tests updated
4. Both `to_binary_grid()` and `to_binary_grid_vec()` work correctly

### Changing Maze Size

Update constants in `lib.rs`:
```rust
pub const MAZE_ROWS: usize = 30;  // Change from 20
pub const MAZE_COLS: usize = 30;  // Change from 20
```

This automatically updates:
- `GRID_SIZE` = 61 (30*2+1)
- `GRID_DATA_SIZE` = 3,721 (61*61)
- All dependent code

## License

See parent LICENSE file.
