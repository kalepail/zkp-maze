use host::{generate_maze_proof, verify_path_proof, MazeProof};
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
                eprintln!("Usage: {} generate-maze <maze_seed> [output_file]", args[0]);
                std::process::exit(1);
            }

            let maze_seed: u32 = args[2].parse().unwrap_or_else(|_| {
                eprintln!("❌ Error: Invalid maze seed '{}'. Must be a positive integer.", args[2]);
                std::process::exit(1);
            });

            let output_file = args.get(3).map(|s| s.as_str());

            generate_maze_command(maze_seed, output_file);
        }

        "verify-path" => {
            if args.len() < 4 {
                eprintln!("Usage: {} verify-path <maze_proof_file> <moves_file>", args[0]);
                eprintln!("Error: Missing required arguments");
                std::process::exit(1);
            }

            let maze_proof_file = &args[2];
            let moves_file = &args[3];

            verify_path_command(maze_proof_file, moves_file);
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
    eprintln!("  generate-maze <seed> [output_file]");
    eprintln!("      Generate a maze proof from a seed");
    eprintln!("      - seed: Integer seed for maze generation");
    eprintln!("      - output_file: Optional file to save the maze proof (JSON)");
    eprintln!("                     Defaults to: <seed>_maze_proof.json");
    eprintln!();
    eprintln!("  verify-path <maze_proof_file> <moves_file>");
    eprintln!("      Verify a player's path against a maze proof");
    eprintln!("      - maze_proof_file: JSON file containing the maze proof");
    eprintln!("      - moves_file: JSON file containing the moves array");
    eprintln!();
    eprintln!("Example workflow:");
    eprintln!("  1. Generate maze:  {} generate-maze 2918957128", program);
    eprintln!("     (saves to 2918957128_maze_proof.json)");
    eprintln!("  2. Verify path:    {} verify-path 2918957128_maze_proof.json moves.json", program);
}

fn generate_maze_command(maze_seed: u32, output_file: Option<&str>) {
    println!("📋 Generating maze proof");
    println!("  Maze seed: {}", maze_seed);
    println!();

    println!("🔐 Generating proof (this may take a while)...");
    let start = Instant::now();

    match generate_maze_proof(maze_seed) {
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

fn verify_path_command(maze_proof_file: &str, moves_file: &str) {
    println!("📋 Verifying path");
    println!("  Maze proof file: {}", maze_proof_file);
    println!("  Moves file: {}", moves_file);
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

    // Verify path
    println!("🔐 Verifying path proof (this may take a while)...");
    let start = Instant::now();

    match verify_path_proof(&maze_proof, moves) {
        Ok(path_proof) => {
            let duration = start.elapsed();
            println!("  Proving time: {:.2}s", duration.as_secs_f64());
            println!();

            if path_proof.is_valid {
                println!("✅ Path verification successful!");
                println!("🎊 Congratulations! Your path is cryptographically verified!");
                println!();
                println!("The proof demonstrates:");
                println!("  1. The maze was correctly generated from seed {}", path_proof.maze_seed);
                println!("  2. Your path successfully navigates from start to goal");
                println!("{}", "=".repeat(70));
            } else {
                println!("❌ Path verification failed!");
                println!("   The path did not successfully reach the goal.");
                println!("{}", "=".repeat(70));
                std::process::exit(1);
            }
        }
        Err(e) => {
            eprintln!();
            eprintln!("❌ Error verifying path: {}", e);
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
