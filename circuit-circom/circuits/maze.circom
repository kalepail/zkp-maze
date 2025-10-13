pragma circom 2.2.2;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "./maze_config.circom";

// Custom selector for array lookup
// Selects maze[index] using one-hot encoding
template ArraySelector(size) {
    signal input arr[size];  // The array to select from
    signal input index;      // The index to select
    signal output value;     // The selected value

    // Create one-hot selector
    component isEqual[size];
    signal selected[size];

    for (var i = 0; i < size; i++) {
        isEqual[i] = IsEqual();
        isEqual[i].in[0] <== index;
        isEqual[i].in[1] <== i;

        // Multiply array value by selector (1 if selected, 0 otherwise)
        selected[i] <== arr[i] * isEqual[i].out;
    }

    // Sum all selected values (only one will be non-zero)
    var sum = 0;
    for (var i = 0; i < size; i++) {
        sum += selected[i];
    }
    value <== sum;
}

// Full maze verifier with wall collision detection
// This provides the same security guarantees as the Noir circuit
template FullMazeVerifier() {
    var MAZE_SIZE = getMazeSize();
    var MAX_MOVES = 500;  // Match Noir circuit
    var START_ROW = getStartPos();
    var START_COL = getStartPos();
    var END_ROW = getEndPos();
    var END_COL = getEndPos();
    var MAZE_SEED = getMazeSeed();
    var GRID_SIZE = MAZE_SIZE * MAZE_SIZE;  // 1681 for 41x41

    // Public input: maze seed
    signal input maze_seed;

    // Private inputs: moves
    signal input moves[MAX_MOVES];

    // Verify correct maze seed
    maze_seed === MAZE_SEED;

    // Get the flattened maze array
    var maze[GRID_SIZE] = getMazeFlat();

    // Track position through the maze
    signal row[MAX_MOVES + 1];
    signal col[MAX_MOVES + 1];

    // Initialize at start position
    row[0] <== START_ROW;
    col[0] <== START_COL;

    // Track if we've reached the end
    signal reached[MAX_MOVES + 1];
    reached[0] <== 0;

    // Declare all signals and components upfront
    signal row_delta[MAX_MOVES];
    signal col_delta[MAX_MOVES];
    signal not_reached[MAX_MOVES];
    signal maze_index[MAX_MOVES];

    component is_north[MAX_MOVES];
    component is_east[MAX_MOVES];
    component is_south[MAX_MOVES];
    component is_west[MAX_MOVES];
    component row_lt[MAX_MOVES];
    component col_lt[MAX_MOVES];
    component at_end_row[MAX_MOVES];
    component at_end_col[MAX_MOVES];
    component and_gate[MAX_MOVES];
    component or_gate[MAX_MOVES];

    // Wall collision check components
    component cell_selector[MAX_MOVES];
    signal cell_value[MAX_MOVES];

    for (var i = 0; i < MAX_MOVES; i++) {
        // Direction checks (0=North, 1=East, 2=South, 3=West)
        is_north[i] = IsEqual();
        is_north[i].in[0] <== moves[i];
        is_north[i].in[1] <== 0;

        is_east[i] = IsEqual();
        is_east[i].in[0] <== moves[i];
        is_east[i].in[1] <== 1;

        is_south[i] = IsEqual();
        is_south[i].in[0] <== moves[i];
        is_south[i].in[1] <== 2;

        is_west[i] = IsEqual();
        is_west[i].in[0] <== moves[i];
        is_west[i].in[1] <== 3;

        // Calculate deltas
        row_delta[i] <== is_south[i].out - is_north[i].out;
        col_delta[i] <== is_east[i].out - is_west[i].out;

        // Only move if not already reached
        not_reached[i] <== 1 - reached[i];
        row[i + 1] <== row[i] + row_delta[i] * not_reached[i];
        col[i + 1] <== col[i] + col_delta[i] * not_reached[i];

        // Bounds checking
        row_lt[i] = LessThan(8);
        row_lt[i].in[0] <== row[i + 1];
        row_lt[i].in[1] <== MAZE_SIZE;
        row_lt[i].out === 1;

        col_lt[i] = LessThan(8);
        col_lt[i].in[0] <== col[i + 1];
        col_lt[i].in[1] <== MAZE_SIZE;
        col_lt[i].out === 1;

        // WALL COLLISION CHECK: Verify maze[row][col] == 1
        // Calculate flattened index: row * MAZE_SIZE + col
        maze_index[i] <== row[i + 1] * MAZE_SIZE + col[i + 1];

        // Use custom selector to get maze cell value
        cell_selector[i] = ArraySelector(GRID_SIZE);
        cell_selector[i].index <== maze_index[i];
        for (var j = 0; j < GRID_SIZE; j++) {
            cell_selector[i].arr[j] <== maze[j];
        }
        cell_value[i] <== cell_selector[i].value;

        // Assert the selected cell is a path (value 1)
        // Only check if we haven't reached the end yet (avoid checking after winning)
        cell_value[i] * not_reached[i] === 1 * not_reached[i];

        // Check if we reached the end
        at_end_row[i] = IsEqual();
        at_end_row[i].in[0] <== row[i + 1];
        at_end_row[i].in[1] <== END_ROW;

        at_end_col[i] = IsEqual();
        at_end_col[i].in[0] <== col[i + 1];
        at_end_col[i].in[1] <== END_COL;

        and_gate[i] = AND();
        and_gate[i].a <== at_end_row[i].out;
        and_gate[i].b <== at_end_col[i].out;

        or_gate[i] = OR();
        or_gate[i].a <== reached[i];
        or_gate[i].b <== and_gate[i].out;

        reached[i + 1] <== or_gate[i].out;
    }

    // Must have reached the end
    reached[MAX_MOVES] === 1;
}

component main {public [maze_seed]} = FullMazeVerifier();

/*
SECURITY MODEL:
This circuit provides the same security guarantees as the Noir circuit:
1. Maze identity check (correct maze_seed)
2. Fixed start position
3. Sequential movement validation
4. Bounds checking (all positions < MAZE_SIZE)
5. Wall collision detection (all positions are path cells, value=1)
6. Goal achievement (must reach END_POS)

This is a fair comparison with the Noir implementation.
*/
