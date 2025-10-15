use crate::rng::PedersenRng;

// Direction constants (must match Python and verification circuit)
pub global NORTH: u32 = 0;
pub global EAST: u32 = 1;
pub global SOUTH: u32 = 2;
pub global WEST: u32 = 3;

// Maze configuration
pub global CELL_ROWS: u32 = 20;
pub global CELL_COLS: u32 = 20;
pub global GRID_SIZE: u32 = 41; // CELL_ROWS * 2 + 1
pub global MAX_STACK_SIZE: u32 = 400; // Exactly 20x20 cells

// OPTIMIZATION: Cell with walls encoded as single u8 bitmask
// Bit 0 = NORTH, Bit 1 = EAST, Bit 2 = SOUTH, Bit 3 = WEST
// This reduces storage and enables more efficient bit operations
struct Cell {
    walls: u8,   // Bitmask: 0001=NORTH, 0010=EAST, 0100=SOUTH, 1000=WEST
    visited: bool,
}

impl Cell {
    fn new() -> Self {
        Cell {
            walls: 15, // All walls present initially (0b1111 = 15)
            visited: false,
        }
    }

    // Check if wall exists in given direction
    fn has_wall(self, direction: u32) -> bool {
        let mask = (1 as u8) << (direction as u8); // Convert direction to bit position
        (self.walls & mask) != 0
    }

    // Remove wall in given direction (returns modified cell)
    fn remove_wall(mut self, direction: u32) -> Self {
        let mask = (1 as u8) << (direction as u8);
        self.walls = self.walls & (255 - mask); // Clear the bit (255 = 0xFF)
        self
    }
}

// Stack for recursive backtracker - fixed size array with pointer
struct CellStack {
    data: [(u32, u32); MAX_STACK_SIZE],
    size: u32,
}

impl CellStack {
    fn new() -> Self {
        CellStack {
            data: [(0, 0); MAX_STACK_SIZE],
            size: 0,
        }
    }

    fn push(&mut self, row: u32, col: u32) {
        assert(self.size < MAX_STACK_SIZE, "Stack overflow");
        self.data[self.size] = (row, col);
        self.size += 1;
    }

    fn pop(&mut self) -> (u32, u32) {
        assert(self.size > 0, "Stack underflow");
        self.size -= 1;
        self.data[self.size]
    }
}

// OPTIMIZATION: Lookup table for opposite directions (no conditionals)
fn get_opposite_direction(direction: u32) -> u32 {
    let opposites = [SOUTH, WEST, NORTH, EAST]; // [NORTH->SOUTH, EAST->WEST, SOUTH->NORTH, WEST->EAST]
    opposites[direction]
}

// Helper for wrapping subtraction - returns large value on underflow
fn wrapping_sub(a: u32, b: u32) -> u32 {
    if a >= b {
        a - b
    } else {
        // Return value larger than any valid coordinate
        // This will fail the bounds check
        0xFFFFFFFF
    }
}

// OPTIMIZATION: Wrapping arithmetic with cached neighbor data
// Returns array of (direction, row, col, is_valid) for all 4 directions
// Underflow produces large value which fails bounds check
fn get_all_neighbors(row: u32, col: u32) -> [(u32, u32, u32, bool); 4] {
    let north_row = wrapping_sub(row, 1);
    let south_row = row + 1;
    let east_col = col + 1;
    let west_col = wrapping_sub(col, 1);

    [
        (NORTH, north_row, col, (north_row < CELL_ROWS) & (col < CELL_COLS)),
        (EAST, row, east_col, (row < CELL_ROWS) & (east_col < CELL_COLS)),
        (SOUTH, south_row, col, (south_row < CELL_ROWS) & (col < CELL_COLS)),
        (WEST, row, west_col, (row < CELL_ROWS) & (west_col < CELL_COLS)),
    ]
}

// Generate maze using Recursive Backtracker algorithm
pub fn generate_maze(seed: u32) -> [[u8; GRID_SIZE]; GRID_SIZE] {
    let mut rng = PedersenRng::new(seed);

    // Initialize all cells
    let mut cells: [[Cell; CELL_COLS]; CELL_ROWS] = [[Cell::new(); CELL_COLS]; CELL_ROWS];

    // Recursive backtracker with explicit stack
    let mut stack = CellStack::new();
    let mut current_row: u32 = 0;
    let mut current_col: u32 = 0;

    // Mark start cell as visited and push to stack
    let mut start_cell = cells[0][0];
    start_cell.visited = true;
    cells[0][0] = start_cell;
    stack.push(0, 0);

    // OPTIMIZATION: Track if we've ever had an empty stack to enable early termination
    let mut finished = false;

    // Process until stack is empty
    for _ in 0..MAX_STACK_SIZE {
        // OPTIMIZATION: Make remaining iterations cheap no-ops once finished
        if !finished {
            if stack.size > 0 {
                // OPTIMIZATION: Get all neighbors at once (cached data)
                let all_neighbors = get_all_neighbors(current_row, current_col);

                // Build list of unvisited neighbors
                let mut unvisited_neighbors: [(u32, u32, u32); 4] = [(0, 0, 0); 4];
                let mut neighbor_count: u32 = 0;

                for i in 0..4 {
                    let (dir, nr, nc, is_valid) = all_neighbors[i];
                    if is_valid {
                        if !cells[nr][nc].visited {
                            unvisited_neighbors[neighbor_count] = (dir, nr, nc);
                            neighbor_count += 1;
                        }
                    }
                }

                if neighbor_count > 0 {
                    // Choose random neighbor
                    let choice = rng.next_index(neighbor_count);
                    let (chosen_direction, next_row, next_col) = unvisited_neighbors[choice];

                    // OPTIMIZATION: Remove walls using bitmask operations (faster than array indexing)
                    let current_cell = cells[current_row][current_col];
                    cells[current_row][current_col] = current_cell.remove_wall(chosen_direction);

                    let opposite_dir = get_opposite_direction(chosen_direction);
                    let mut neighbor_cell = cells[next_row][next_col];
                    neighbor_cell = neighbor_cell.remove_wall(opposite_dir);
                    neighbor_cell.visited = true;
                    cells[next_row][next_col] = neighbor_cell;

                    // Push to stack and move to neighbor
                    stack.push(next_row, next_col);
                    current_row = next_row;
                    current_col = next_col;
                } else {
                    // Backtrack
                    let (prev_row, prev_col) = stack.pop();
                    current_row = prev_row;
                    current_col = prev_col;
                }
            } else {
                // Stack is empty, maze generation complete
                finished = true;
            }
        }
        // When finished=true, remaining iterations are cheap no-ops
    }

    // Convert cells to binary grid
    let mut grid: [[u8; GRID_SIZE]; GRID_SIZE] = [[0; GRID_SIZE]; GRID_SIZE];

    // OPTIMIZATION: Use bitmask operations with direct assignments (no conditionals)
    // In ZK circuits, conditional assignments compile to multiplications
    // Direct boolean-to-int conversion is more efficient
    for row in 0..CELL_ROWS {
        for col in 0..CELL_COLS {
            let cell = cells[row][col];
            // Cell center position in grid
            let gr = row * 2 + 1;
            let gc = col * 2 + 1;

            // Cell itself is always path
            grid[gr][gc] = 1;

            // OPTIMIZATION: Direct assignment instead of conditionals
            // Wall removed = bit is 0, so we invert: wall_removed = (bit == 0)
            // Bitmask: 0001=NORTH, 0010=EAST, 0100=SOUTH, 1000=WEST

            // NORTH wall (bit 0): write 1 if wall removed
            grid[gr - 1][gc] = ((cell.walls & 1) == 0) as u8;

            // EAST wall (bit 1): write 1 if wall removed
            grid[gr][gc + 1] = ((cell.walls & 2) == 0) as u8;

            // SOUTH wall (bit 2): write 1 if wall removed
            grid[gr + 1][gc] = ((cell.walls & 4) == 0) as u8;

            // WEST wall (bit 3): write 1 if wall removed
            grid[gr][gc - 1] = ((cell.walls & 8) == 0) as u8;
        }
    }

    grid
}
