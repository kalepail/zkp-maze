mod maze_config;
mod test_solutions;

use maze_config::{MAZE, MAZE_ROWS, MAZE_COLS, START_ROW, START_COL, END_ROW, END_COL, MAZE_SEED};

// Direction constants (must match frontend encoding)
global NORTH: u8 = 0;
global EAST: u8 = 1;
global SOUTH: u8 = 2;
global WEST: u8 = 3;

// Maximum number of moves allowed
global MAX_MOVES: u32 = 500;

fn main(moves: [u8; MAX_MOVES], maze_seed: pub u32) {
    // Verify this proof is for the correct maze
    assert(maze_seed == MAZE_SEED, "Wrong maze seed");

    // Start position (hardcoded constants, always valid for generated mazes)
    let mut row = START_ROW;
    let mut col = START_COL;
    let mut has_reached_end = false;

    // Process moves until we reach the end
    for i in 0..MAX_MOVES {
        if !has_reached_end {
            let direction = moves[i];

            // Calculate next position based on direction
            // Invalid directions will fail naturally in the assertions below
            let (next_row, next_col) = get_next_position(row, col, direction);

            // Verify next position is within bounds
            assert(next_row < MAZE_ROWS, "Move out of bounds (row)");
            assert(next_col < MAZE_COLS, "Move out of bounds (col)");

            // Verify next position is not a wall
            assert(MAZE[next_row][next_col] == 1, "Hit a wall");

            // Update position
            row = next_row;
            col = next_col;

            // Check if we've reached the end
            if (row == END_ROW) & (col == END_COL) {
                has_reached_end = true;
            }
        }
    }

    // Verify we actually reached the end
    assert(has_reached_end, "Did not reach end");
}

fn get_next_position(row: u32, col: u32, direction: u8) -> (u32, u32) {
    if direction == NORTH {
        // Moving up means decreasing row - underflow caught by bounds check in main()
        (row - 1, col)
    } else if direction == EAST {
        // Moving right means increasing col
        (row, col + 1)
    } else if direction == SOUTH {
        // Moving down means increasing row
        (row + 1, col)
    } else if direction == WEST {
        // Moving left means decreasing col - underflow caught by bounds check in main()
        (row, col - 1)
    } else {
        // Invalid direction - must be 0-3 for valid gameplay
        assert(false, "Invalid direction");
        (row, col)
    }
}
