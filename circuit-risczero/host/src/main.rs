use host::{generate_maze_proof, verify_path_proof, verify_path_proof_receipt, MazeProof, PathProof, ReceiptKind};
use std::env;
use std::fs;
use std::time::Instant;

fn main() {
    // Initialize tracing for debug output
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::filter::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    println!("🔍 RISC Zero Maze Proof System (Two-Stage Architecture)");
    println!("{}", "=".repeat(70));
    println!();

    // Parse CLI arguments
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage(&args[0]);
        std::process::exit(1);
    }

    let command = &args[1];

    match command.as_str() {
        "generate-maze" => {
            if args.len() < 3 {
                eprintln!("Usage: {} generate-maze <maze_seed> [--receipt-type <type>] [output_file]", args[0]);
                std::process::exit(1);
            }

            let maze_seed: u32 = args[2].parse().unwrap_or_else(|_| {
                eprintln!("❌ Error: Invalid maze seed '{}'. Must be a positive integer.", args[2]);
                std::process::exit(1);
            });

            // Parse optional --receipt-type flag
            let mut receipt_kind = ReceiptKind::default();
            let mut output_file_idx = 3;

            if args.len() > 3 && args[3] == "--receipt-type" {
                if args.len() < 5 {
                    eprintln!("❌ Error: --receipt-type requires a value (composite|succinct|groth16)");
                    std::process::exit(1);
                }
                receipt_kind = args[4].parse().unwrap_or_else(|e| {
                    eprintln!("❌ Error: {}", e);
                    std::process::exit(1);
                });
                output_file_idx = 5;
            }

            let output_file = args.get(output_file_idx).map(|s| s.as_str());

            generate_maze_command(maze_seed, receipt_kind, output_file);
        }

        "verify-path" => {
            if args.len() < 4 {
                eprintln!("Usage: {} verify-path <maze_proof_file> <moves_file> [--receipt-type <type>] [output_file]", args[0]);
                eprintln!("Error: Missing required arguments");
                std::process::exit(1);
            }

            let maze_proof_file = &args[2];
            let moves_file = &args[3];

            // Parse optional --receipt-type flag
            let mut receipt_kind = None;
            let mut output_file_idx = 4;

            if args.len() > 4 && args[4] == "--receipt-type" {
                if args.len() < 6 {
                    eprintln!("❌ Error: --receipt-type requires a value (composite|succinct|groth16)");
                    std::process::exit(1);
                }
                receipt_kind = Some(args[5].parse().unwrap_or_else(|e| {
                    eprintln!("❌ Error: {}", e);
                    std::process::exit(1);
                }));
                output_file_idx = 6;
            }

            let output_file = args.get(output_file_idx).map(|s| s.as_str());

            verify_path_command(maze_proof_file, moves_file, receipt_kind, output_file);
        }

        "verify-proof" => {
            if args.len() < 3 {
                eprintln!("Usage: {} verify-proof <path_proof_file>", args[0]);
                eprintln!("Error: Missing required argument");
                std::process::exit(1);
            }

            let path_proof_file = &args[2];

            verify_proof_command(path_proof_file);
        }

        _ => {
            eprintln!("❌ Unknown command: {}", command);
            print_usage(&args[0]);
            std::process::exit(1);
        }
    }
}

fn print_usage(program: &str) {
    eprintln!("Usage: {} <command> [options]", program);
    eprintln!();
    eprintln!("Commands:");
    eprintln!("  generate-maze <seed> [--receipt-type <type>] [output_file]");
    eprintln!("      Generate a maze proof from a seed");
    eprintln!("      - seed: Integer seed for maze generation");
    eprintln!("      - --receipt-type: Optional receipt type (composite|succinct|groth16)");
    eprintln!("                        Default: succinct");
    eprintln!("      - output_file: Optional file to save the maze proof (JSON)");
    eprintln!("                     Defaults to: <seed>_maze_proof.json");
    eprintln!();
    eprintln!("  verify-path <maze_proof_file> <moves_file> [--receipt-type <type>] [output_file]");
    eprintln!("      Generate a path verification proof");
    eprintln!("      - maze_proof_file: JSON file containing the maze proof");
    eprintln!("      - moves_file: JSON file containing the moves array");
    eprintln!("      - --receipt-type: Optional receipt type override (composite|succinct|groth16)");
    eprintln!("                        If not provided, auto-detects from maze_proof");
    eprintln!("                        Useful for succinct maze → groth16 path compression");
    eprintln!("      - output_file: Optional file to save the path proof (JSON)");
    eprintln!("                     Defaults to: <seed>_path_proof.json");
    eprintln!();
    eprintln!("  verify-proof <path_proof_file>");
    eprintln!("      Cryptographically verify a path proof receipt");
    eprintln!("      - path_proof_file: JSON file containing the path proof");
    eprintln!();
    eprintln!("Receipt Types:");
    eprintln!("  composite: Fastest proving, largest size (~MB)");
    eprintln!("  succinct:  Balanced, medium size (~200 KB) - recommended");
    eprintln!("  groth16:   Slowest proving, smallest size (~200 bytes) - best for network transfer");
    eprintln!();
    eprintln!("Example workflow:");
    eprintln!("  1. Generate maze:  {} generate-maze 2918957128 --receipt-type groth16", program);
    eprintln!("     (saves to 2918957128_maze_proof.json)");
    eprintln!("  2. Generate proof: {} verify-path 2918957128_maze_proof.json moves.json", program);
    eprintln!("     (saves to 2918957128_path_proof.json)");
    eprintln!("  3. Verify proof:   {} verify-proof 2918957128_path_proof.json", program);
}

fn generate_maze_command(maze_seed: u32, receipt_kind: ReceiptKind, output_file: Option<&str>) {
    println!("📋 Generating maze proof");
    println!("  Maze seed: {}", maze_seed);
    println!("  Receipt type: {}", receipt_kind);
    println!();

    println!("🔐 Generating proof (this may take a while)...");
    let start = Instant::now();

    match generate_maze_proof(maze_seed, receipt_kind) {
        Ok(maze_proof) => {
            let duration = start.elapsed();
            println!("  Proving time: {:.2}s", duration.as_secs_f64());
            println!();
            println!("✅ Maze proof generated successfully!");
            println!("  Seed: {}", maze_proof.maze_seed);
            println!("  Grid hash: {:02x}{:02x}{:02x}{:02x}...",
                     maze_proof.grid_hash[0],
                     maze_proof.grid_hash[1],
                     maze_proof.grid_hash[2],
                     maze_proof.grid_hash[3]);
            println!("  Journal size: {} bytes (seed + hash) - 97.9% smaller!",
                     maze_proof.receipt.journal.bytes.len());
            println!("  Grid size: {}x{} cells",
                     maze_proof.grid_data.len(),
                     maze_proof.grid_data[0].len());
            println!();

            // Use default filename pattern if no output file specified
            let default_filename = format!("{}_maze_proof.json", maze_seed);
            let file_to_save = output_file.unwrap_or(&default_filename);

            match save_maze_proof(&maze_proof, file_to_save) {
                Ok(_) => {
                    println!("💾 Maze proof saved to: {}", file_to_save);
                    println!("   Share this file with players to verify their paths!");
                }
                Err(e) => {
                    eprintln!("❌ Error saving maze proof: {}", e);
                    std::process::exit(1);
                }
            }

            println!("{}", "=".repeat(70));
        }
        Err(e) => {
            eprintln!();
            eprintln!("❌ Error generating maze proof: {}", e);
            eprintln!("{}", "=".repeat(70));
            std::process::exit(1);
        }
    }
}

fn verify_path_command(maze_proof_file: &str, moves_file: &str, receipt_kind: Option<ReceiptKind>, output_file: Option<&str>) {
    println!("📋 Generating path verification proof");
    println!("  Maze proof file: {}", maze_proof_file);
    println!("  Moves file: {}", moves_file);
    if let Some(kind) = receipt_kind {
        println!("  Receipt type override: {}", kind);
    }
    println!();

    // Load maze proof
    let maze_proof = match load_maze_proof(maze_proof_file) {
        Ok(proof) => proof,
        Err(e) => {
            eprintln!("❌ Error loading maze proof: {}", e);
            std::process::exit(1);
        }
    };

    println!("📦 Loaded maze proof (seed: {})", maze_proof.maze_seed);

    // Load moves
    let moves = match load_moves(moves_file) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("❌ Error loading moves: {}", e);
            std::process::exit(1);
        }
    };

    println!("📦 Loaded {} moves", moves.len());
    println!("  First 20 moves: {:?}", &moves[..20.min(moves.len())]);
    println!();

    // Generate path verification proof
    println!("🔐 Generating path verification proof (this may take a while)...");
    let start = Instant::now();

    match verify_path_proof(&maze_proof, moves, receipt_kind) {
        Ok(path_proof) => {
            let duration = start.elapsed();
            println!("  Proving time: {:.2}s", duration.as_secs_f64());
            println!();
            println!("✅ Path proof generated successfully!");
            println!("  Seed: {}", path_proof.maze_seed);
            println!("  Path valid: {}", if path_proof.is_valid { "Yes ✓" } else { "No ✗" });
            println!("  Journal size: {} bytes", path_proof.receipt.journal.bytes.len());
            println!();

            // Use default filename pattern if no output file specified
            let default_filename = format!("{}_path_proof.json", path_proof.maze_seed);
            let file_to_save = output_file.unwrap_or(&default_filename);

            match save_path_proof(&path_proof, file_to_save) {
                Ok(_) => {
                    println!("💾 Path proof saved to: {}", file_to_save);
                    println!("   Use 'verify-proof {}' to cryptographically verify this proof", file_to_save);
                }
                Err(e) => {
                    eprintln!("❌ Error saving path proof: {}", e);
                    std::process::exit(1);
                }
            }

            println!("{}", "=".repeat(70));
        }
        Err(e) => {
            eprintln!();
            eprintln!("❌ Error generating path proof: {}", e);
            eprintln!("{}", "=".repeat(70));
            std::process::exit(1);
        }
    }
}

fn verify_proof_command(path_proof_file: &str) {
    println!("📋 Verifying path proof receipt");
    println!("  Path proof file: {}", path_proof_file);
    println!();

    // Load path proof
    let path_proof = match load_path_proof(path_proof_file) {
        Ok(proof) => proof,
        Err(e) => {
            eprintln!("❌ Error loading path proof: {}", e);
            std::process::exit(1);
        }
    };

    println!("📦 Loaded path proof (seed: {})", path_proof.maze_seed);
    println!("  Path valid: {}", if path_proof.is_valid { "Yes ✓" } else { "No ✗" });
    println!();

    // Cryptographically verify the receipt
    println!("🔐 Verifying receipt cryptographically...");
    let start = Instant::now();

    match verify_path_proof_receipt(&path_proof) {
        Ok(()) => {
            let duration = start.elapsed();
            println!("  Verification time: {:.2}s", duration.as_secs_f64());
            println!();
            println!("✅ Receipt cryptographically verified!");
            println!();
            println!("The proof cryptographically attests that:");
            println!("  1. The maze was correctly generated from seed {}", path_proof.maze_seed);
            println!("  2. The path {} the goal", if path_proof.is_valid { "successfully reached" } else { "did NOT reach" });
            println!("  3. The computation was executed correctly in the zkVM");
            println!();
            if path_proof.is_valid {
                println!("🎊 Congratulations! Your maze solution is cryptographically verified!");
            }
            println!("{}", "=".repeat(70));
        }
        Err(e) => {
            eprintln!();
            eprintln!("❌ Receipt verification failed: {}", e);
            eprintln!();
            eprintln!("The receipt is not cryptographically valid. This could mean:");
            eprintln!("  - The proof was tampered with");
            eprintln!("  - The proof was not generated by the correct program");
            eprintln!("  - The receipt data is corrupted");
            eprintln!("{}", "=".repeat(70));
            std::process::exit(1);
        }
    }
}

fn save_maze_proof(maze_proof: &MazeProof, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(maze_proof)?;
    fs::write(path, json)?;
    Ok(())
}

fn load_maze_proof(path: &str) -> Result<MazeProof, Box<dyn std::error::Error>> {
    let json = fs::read_to_string(path)?;
    let maze_proof: MazeProof = serde_json::from_str(&json)?;
    Ok(maze_proof)
}

fn save_path_proof(path_proof: &PathProof, path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(path_proof)?;
    fs::write(path, json)?;
    Ok(())
}

fn load_path_proof(path: &str) -> Result<PathProof, Box<dyn std::error::Error>> {
    let json = fs::read_to_string(path)?;
    let path_proof: PathProof = serde_json::from_str(&json)?;
    Ok(path_proof)
}

fn load_moves(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let json = fs::read_to_string(path)?;

    // Validate file size (prevent loading gigabytes into memory)
    if json.len() > 10_000_000 {  // 10MB limit
        return Err("Moves file is too large (max 10MB)".into());
    }

    let moves: Vec<u8> = serde_json::from_str(&json)?;

    // Validate moves count
    if moves.is_empty() {
        return Err("Moves array is empty".into());
    }

    if moves.len() > 10000 {  // Reasonable upper bound
        return Err(format!("Too many moves: {} (max 10000)", moves.len()).into());
    }

    Ok(moves)
}
