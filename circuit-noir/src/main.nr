mod maze_config;
mod test_solutions;

use maze_config::{MAZE, MAZE_SIZE, START_POS, END_POS, MAZE_SEED};

// Direction constants (must match frontend encoding)
global NORTH: u8 = 0;
global EAST: u8 = 1;
global SOUTH: u8 = 2;
global WEST: u8 = 3;

// Maximum number of moves allowed
global MAX_MOVES: u32 = 500;

// SECURITY MODEL:
// This circuit proves that a player successfully navigated from START_POS to END_POS
// through a valid path in the maze, verified by:
// 1. Maze identity check (correct maze_seed)
// 2. Fixed start position (START_POS, START_POS)
// 3. Sequential movement validation (only +/-1 per move)
// 4. Bounds checking (all positions < MAZE_SIZE)
// 5. Wall collision detection (all positions are path cells)
// 6. Goal achievement (must reach END_POS, END_POS)
//
// NOTE ON DIRECTION VALIDATION:
// Invalid direction values (!= 0,1,2,3) result in no-op moves (position unchanged).
// This is SECURE because:
// - No-ops cannot help reach the goal (still need valid moves to traverse maze)
// - No-ops cannot bypass wall/bounds checks (current position is validated)
// - No-ops cannot enable teleportation or wall-skipping
// - u8 underflow (0-1=255) is caught by bounds checking (255 < 41 = false)
// This design saves ~3,500 gates vs explicit direction validation while maintaining
// cryptographic soundness. Invalid moves simply waste slots in the move array.

fn main(moves: [u8; MAX_MOVES], maze_seed: pub u32) {
    // Verify this proof is for the correct maze
    assert(maze_seed == MAZE_SEED, "Wrong maze seed");

    // Start position - all u8!
    let mut row = START_POS;
    let mut col = START_POS;
    let mut has_reached_end = false;

    // Process moves until we reach the end
    for i in 0..MAX_MOVES {
        if !has_reached_end {
            let direction = moves[i];

            // Compute position changes using arithmetic (avoids branching for gate efficiency)
            // Valid moves: NORTH(0)->row-1, EAST(1)->col+1, SOUTH(2)->row+1, WEST(3)->col-1
            // Invalid moves (direction not in {0,1,2,3}): All comparisons false -> row+0-0, col+0-0 (no-op)
            let next_row = row + (direction == SOUTH) as u8 - (direction == NORTH) as u8;
            let next_col = col + (direction == EAST) as u8 - (direction == WEST) as u8;

            // Cast once for array indexing (required by Noir)
            let next_row_u32 = next_row as u32;
            let next_col_u32 = next_col as u32;

            // SECURITY: Bounds check prevents out-of-bounds access AND catches u8 underflow
            // Example: position (0,5) + NORTH = (255,5) -> 255 < 41 = false -> proof fails
            assert((next_row < MAZE_SIZE) & (next_col < MAZE_SIZE), "Move out of bounds");

            // SECURITY: Wall check ensures every position in the path is a valid cell (value=1)
            // Prevents walking through walls or teleporting to unconnected maze sections
            assert(MAZE[next_row_u32][next_col_u32] == 1, "Hit a wall");

            // Update position
            row = next_row;
            col = next_col;

            // Check if we've reached the end (boolean OR allows continuing after reaching goal)
            has_reached_end = has_reached_end | ((row == END_POS) & (col == END_POS));
        }
    }

    // SECURITY: Final validation ensures the prover actually reached the goal position
    // Cannot generate a valid proof by just wandering around or using only no-op moves
    assert(has_reached_end, "Did not reach end");
}
