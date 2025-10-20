use maze_core::{Maze, MAZE_JOURNAL_SIZE, GRID_SIZE, GRID_DATA_SIZE, MAX_MOVES};
use methods::{MAZE_GEN_ELF, MAZE_GEN_ID, PATH_VERIFY_ELF, PATH_VERIFY_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts, Receipt};
use serde::{Deserialize, Serialize};

/// Receipt type for proof generation
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReceiptKind {
    /// Composite receipt - fastest to generate, largest size (multiple MB)
    Composite,
    /// Succinct receipt - STARK proof, medium size (~200 KB)
    Succinct,
    /// Groth16 receipt - SNARK proof, smallest size (~200-300 bytes)
    Groth16,
}

impl Default for ReceiptKind {
    fn default() -> Self {
        ReceiptKind::Succinct
    }
}

impl std::str::FromStr for ReceiptKind {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "composite" => Ok(ReceiptKind::Composite),
            "succinct" => Ok(ReceiptKind::Succinct),
            "groth16" => Ok(ReceiptKind::Groth16),
            _ => Err(format!("Invalid receipt kind: '{}'. Must be 'composite', 'succinct', or 'groth16'", s)),
        }
    }
}

impl std::fmt::Display for ReceiptKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReceiptKind::Composite => write!(f, "composite"),
            ReceiptKind::Succinct => write!(f, "succinct"),
            ReceiptKind::Groth16 => write!(f, "groth16"),
        }
    }
}

impl From<ReceiptKind> for risc0_zkvm::ReceiptKind {
    fn from(kind: ReceiptKind) -> Self {
        match kind {
            ReceiptKind::Composite => risc0_zkvm::ReceiptKind::Composite,
            ReceiptKind::Succinct => risc0_zkvm::ReceiptKind::Succinct,
            ReceiptKind::Groth16 => risc0_zkvm::ReceiptKind::Groth16,
        }
    }
}

/// Output from maze generation proof (Hash-Based Architecture)
///
/// The receipt journal contains only the seed and SHA-256 hash (36 bytes),
/// making it 97.9% smaller than the previous architecture.
/// The actual grid data is stored separately for visualization and path verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MazeProof {
    /// The seed used to generate this maze
    pub maze_seed: u32,

    /// SHA-256 hash of the grid (from the journal)
    pub grid_hash: [u8; 32],

    /// The actual binary grid data (0=wall, 1=path)
    /// This is NOT in the journal, but is needed for:
    /// - Visualization/display
    /// - Input to path verification
    /// Stored as 2D array for ergonomics
    pub grid_data: Vec<Vec<u8>>,

    /// The receipt proving correct maze generation
    /// Journal contains: seed (4 bytes) + grid_hash (32 bytes) = 36 bytes
    pub receipt: Receipt,

    /// The type of receipt generated (composite, succinct, or groth16)
    pub receipt_kind: ReceiptKind,
}

/// Output from path verification proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathProof {
    /// Whether the path successfully reached the goal
    pub is_valid: bool,

    /// The seed of the maze this path was verified against
    pub maze_seed: u32,

    /// The receipt proving path validity (includes maze proof assumption)
    pub receipt: Receipt,

    /// The type of receipt generated (composite, succinct, or groth16)
    pub receipt_kind: ReceiptKind,
}

/// Generate a maze proof from a seed (Hash-Based Architecture).
///
/// This creates a cryptographic proof that a maze was correctly generated
/// from the given seed. The proof commits to a SHA-256 hash of the grid
/// (36 bytes) instead of the full grid (1,685 bytes), reducing proof size
/// by 97.9%.
///
/// The actual grid data is also returned for visualization and path verification,
/// but it's NOT embedded in the proof journal.
///
/// # Arguments
/// * `maze_seed` - The seed identifying the maze
/// * `receipt_kind` - The type of receipt to generate (Composite, Succinct, or Groth16)
///
/// # Returns
/// * `Ok(MazeProof)` - The maze proof with receipt, hash, and grid data
/// * `Err` - If proof generation fails
///
/// # Example
/// ```no_run
/// use host::{generate_maze_proof, ReceiptKind};
///
/// let maze_proof = generate_maze_proof(2918957128, ReceiptKind::Groth16).unwrap();
/// println!("Maze generated: seed={}, hash={:02x}{:02x}...",
///          maze_proof.maze_seed,
///          maze_proof.grid_hash[0],
///          maze_proof.grid_hash[1]);
/// ```
pub fn generate_maze_proof(
    maze_seed: u32,
    receipt_kind: ReceiptKind,
) -> Result<MazeProof, Box<dyn std::error::Error>> {
    tracing::info!("Generating maze proof for seed {} with receipt kind: {}", maze_seed, receipt_kind);

    // Build execution environment
    let mut builder = ExecutorEnv::builder();
    builder.write(&maze_seed)?;
    let env = builder.build()?;

    // Configure prover options with desired receipt kind
    let opts = match receipt_kind {
        ReceiptKind::Composite => ProverOpts::composite(),
        ReceiptKind::Succinct => ProverOpts::succinct(),
        ReceiptKind::Groth16 => ProverOpts::groth16(),
    };

    // Generate proof
    let prover = default_prover();
    let prove_info = prover
        .prove_with_opts(env, MAZE_GEN_ELF, &opts)
        .map_err(|e| format!("Failed to generate maze proof: {}", e))?;

    let receipt = prove_info.receipt;

    // Decode journal
    // Format: maze_seed (u32, 4 bytes) + grid_hash (32 bytes) = 36 bytes
    let journal_bytes = &receipt.journal.bytes;
    if journal_bytes.len() < MAZE_JOURNAL_SIZE {
        return Err(format!(
            "Journal too short: expected {} bytes, got {}",
            MAZE_JOURNAL_SIZE,
            journal_bytes.len()
        )
        .into());
    }

    let maze_seed_out = u32::from_le_bytes([
        journal_bytes[0],
        journal_bytes[1],
        journal_bytes[2],
        journal_bytes[3],
    ]);

    let mut grid_hash = [0u8; 32];
    grid_hash.copy_from_slice(&journal_bytes[4..MAZE_JOURNAL_SIZE]);

    // IMPORTANT: We need to regenerate the maze to get the grid data
    // for visualization and path verification input.
    // This is safe because maze generation is deterministic.
    tracing::info!("Regenerating maze to extract grid data...");
    let grid_data = regenerate_maze_grid(maze_seed)?;

    tracing::info!("Maze proof generated successfully (journal: {} bytes, receipt kind: {})", MAZE_JOURNAL_SIZE, receipt_kind);

    Ok(MazeProof {
        maze_seed: maze_seed_out,
        grid_hash,
        grid_data,
        receipt,
        receipt_kind,
    })
}

/// Regenerate a maze grid from a seed (for host-side use only).
///
/// This regenerates the same maze that was generated in the guest program
/// so we can extract the grid data for display and path verification.
///
/// This is safe because maze generation is deterministic (same algorithm and RNG).
fn regenerate_maze_grid(seed: u32) -> Result<Vec<Vec<u8>>, Box<dyn std::error::Error>> {
    let maze = Maze::generate(20, 20, seed);
    let grid = maze.to_binary_grid_vec();

    Ok(grid)
}

/// Generate a path verification proof for a player's moves through a maze.
///
/// This creates a cryptographic proof that:
/// 1. The maze was correctly generated (verified in guest via env::verify)
/// 2. The provided grid matches the committed hash
/// 3. The player's path successfully navigates from start to end
///
/// The final receipt proves all three conditions. Note: This function generates
/// the proof but does not verify it. Use `verify_path_proof_receipt()` to verify.
///
/// The receipt type can be overridden, or will be automatically detected from
/// the maze proof if not specified. This allows for flexible proof composition,
/// such as using a Succinct maze proof with a Groth16 path proof for maximum
/// compression of the final result.
///
/// # Arguments
/// * `maze_proof` - The maze proof to verify against (contains receipt, hash, and grid)
/// * `moves` - Vector of move directions (0=NORTH, 1=EAST, 2=SOUTH, 3=WEST)
/// * `receipt_kind_override` - Optional receipt type override (if None, uses maze proof's type)
///
/// # Returns
/// * `Ok(PathProof)` - The path verification result with receipt
/// * `Err` - If proof generation fails
///
/// # Example
/// ```no_run
/// use host::{generate_maze_proof, verify_path_proof, ReceiptKind};
///
/// let maze_proof = generate_maze_proof(2918957128, ReceiptKind::Succinct).unwrap();
/// let moves = vec![1, 1, 2, 2]; // EAST, EAST, SOUTH, SOUTH
/// // Use Groth16 for final proof even though maze is Succinct
/// let path_proof = verify_path_proof(&maze_proof, moves, Some(ReceiptKind::Groth16)).unwrap();
/// println!("Path valid: {}", path_proof.is_valid);
/// ```
pub fn verify_path_proof(
    maze_proof: &MazeProof,
    moves: Vec<u8>,
    receipt_kind_override: Option<ReceiptKind>,
) -> Result<PathProof, Box<dyn std::error::Error>> {
    // Use override if provided, otherwise auto-detect from maze proof
    let receipt_kind = receipt_kind_override.unwrap_or(maze_proof.receipt_kind);

    tracing::info!("Verifying path proof for maze seed {} with receipt kind: {}", maze_proof.maze_seed, receipt_kind);

    // Prepare inputs for path verification guest
    let move_count = moves.len().min(MAX_MOVES) as u16;

    // Extract the maze journal from the receipt (seed + hash)
    let maze_journal_bytes = &maze_proof.receipt.journal.bytes;

    // Flatten grid_data for guest input
    let mut grid_flat = [0u8; GRID_DATA_SIZE];
    for (i, row) in maze_proof.grid_data.iter().enumerate() {
        for (j, &cell) in row.iter().enumerate() {
            grid_flat[i * GRID_SIZE + j] = cell;
        }
    }

    // Build execution environment
    let mut builder = ExecutorEnv::builder();

    // Add the maze receipt as an assumption
    // This allows the prover to resolve the assumption created by env::verify() in the guest
    builder.add_assumption(maze_proof.receipt.clone());

    // Write maze image ID (identifies the maze-gen program)
    // Convert [u32; 8] to [u8; 32]
    let mut image_id_bytes = [0u8; 32];
    for (i, &word) in MAZE_GEN_ID.iter().enumerate() {
        let bytes = word.to_le_bytes();
        image_id_bytes[i * 4..(i + 1) * 4].copy_from_slice(&bytes);
    }
    builder.write_slice(&image_id_bytes);

    // Write maze journal (seed + hash, 36 bytes)
    builder.write_slice(maze_journal_bytes);

    // Write grid data as untrusted input (will be verified via hash in guest)
    builder.write_slice(&grid_flat);

    // Write move count and moves
    builder.write(&move_count)?;
    builder.write_slice(&moves[..move_count as usize]);

    let env = builder.build()?;

    // Configure prover options with detected receipt kind
    let opts = match receipt_kind {
        ReceiptKind::Composite => ProverOpts::composite(),
        ReceiptKind::Succinct => ProverOpts::succinct(),
        ReceiptKind::Groth16 => ProverOpts::groth16(),
    };

    // Generate proof with assumptions
    // Note: This creates a "conditional receipt" with an assumption
    // The assumption will be resolved when we request a succinct or groth16 receipt
    tracing::info!("Generating path verification proof...");
    let prover = default_prover();
    let prove_info = prover
        .prove_with_opts(env, PATH_VERIFY_ELF, &opts)
        .map_err(|e| format!("Failed to generate path proof: {}", e))?;

    let receipt = prove_info.receipt;

    // Decode journal
    // Format: is_valid (u32, 0 or 1) + maze_seed (u32)
    let journal_bytes = &receipt.journal.bytes;
    if journal_bytes.len() < 8 {
        return Err(format!(
            "Journal too short: expected 8 bytes, got {}",
            journal_bytes.len()
        )
        .into());
    }

    let is_valid_u32 = u32::from_le_bytes([
        journal_bytes[0],
        journal_bytes[1],
        journal_bytes[2],
        journal_bytes[3],
    ]);

    let maze_seed_out = u32::from_le_bytes([
        journal_bytes[4],
        journal_bytes[5],
        journal_bytes[6],
        journal_bytes[7],
    ]);

    tracing::info!("Path proof generated successfully");

    Ok(PathProof {
        is_valid: is_valid_u32 != 0,
        maze_seed: maze_seed_out,
        receipt,
        receipt_kind,
    })
}

/// Verify a PathProof receipt cryptographically.
///
/// This function verifies that a PathProof's receipt is valid by checking:
/// 1. The receipt is cryptographically valid (signature verification)
/// 2. The receipt was generated by the PATH_VERIFY program (image ID check)
///
/// # Arguments
/// * `path_proof` - The path proof to verify
///
/// # Returns
/// * `Ok(())` - If the receipt is valid
/// * `Err` - If verification fails
///
/// # Example
/// ```no_run
/// use host::{verify_path_proof, verify_path_proof_receipt};
///
/// let path_proof = verify_path_proof(&maze_proof, moves).unwrap();
/// verify_path_proof_receipt(&path_proof).unwrap();
/// println!("Receipt verified!");
/// ```
pub fn verify_path_proof_receipt(
    path_proof: &PathProof,
) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("Verifying path proof receipt for maze seed {}", path_proof.maze_seed);

    // Verify the receipt against the PATH_VERIFY image ID
    path_proof.receipt
        .verify(PATH_VERIFY_ID)
        .map_err(|e| format!("Receipt verification failed: {}", e))?;

    tracing::info!("Receipt verification successful");
    Ok(())
}
