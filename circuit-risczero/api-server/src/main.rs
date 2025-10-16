use actix_web::{middleware, web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors;
use host::{generate_maze_proof, verify_path_proof, verify_path_proof_receipt, MazeProof, PathProof};
use serde::{Deserialize, Serialize};

// Request/Response types

#[derive(Debug, Deserialize)]
struct GenerateMazeRequest {
    seed: u32,
}

#[derive(Debug, Serialize)]
struct GenerateMazeResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    maze_proof: Option<MazeProof>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VerifyPathRequest {
    maze_proof: MazeProof,
    moves: Vec<u8>,
}

#[derive(Debug, Serialize)]
struct VerifyPathResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path_proof: Option<PathProof>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VerifyProofRequest {
    path_proof: PathProof,
}

#[derive(Debug, Serialize)]
struct VerifyProofResponse {
    success: bool,
    is_valid: bool,
    maze_seed: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

// API Handlers

/// POST /api/generate-maze
/// Generate a maze proof from a seed
async fn generate_maze(
    req: web::Json<GenerateMazeRequest>,
) -> impl Responder {
    tracing::info!("Received generate-maze request for seed: {}", req.seed);

    match generate_maze_proof(req.seed) {
        Ok(maze_proof) => {
            tracing::info!("Successfully generated maze proof for seed: {}", req.seed);
            HttpResponse::Ok().json(GenerateMazeResponse {
                success: true,
                maze_proof: Some(maze_proof),
                error: None,
            })
        }
        Err(e) => {
            tracing::error!("Failed to generate maze proof: {}", e);
            HttpResponse::InternalServerError().json(GenerateMazeResponse {
                success: false,
                maze_proof: None,
                error: Some(e.to_string()),
            })
        }
    }
}

/// POST /api/verify-path
/// Generate a path verification proof given a maze proof and moves
async fn verify_path(
    req: web::Json<VerifyPathRequest>,
) -> impl Responder {
    tracing::info!(
        "Received verify-path request for maze seed: {}, moves: {}",
        req.maze_proof.maze_seed,
        req.moves.len()
    );

    match verify_path_proof(&req.maze_proof, req.moves.clone()) {
        Ok(path_proof) => {
            tracing::info!(
                "Successfully verified path for maze seed: {}, valid: {}",
                req.maze_proof.maze_seed,
                path_proof.is_valid
            );
            HttpResponse::Ok().json(VerifyPathResponse {
                success: true,
                path_proof: Some(path_proof),
                error: None,
            })
        }
        Err(e) => {
            tracing::error!("Failed to verify path: {}", e);
            HttpResponse::InternalServerError().json(VerifyPathResponse {
                success: false,
                path_proof: None,
                error: Some(e.to_string()),
            })
        }
    }
}

/// POST /api/verify-proof
/// Verify a path proof cryptographically (checks receipt signature and image ID)
async fn verify_proof(
    req: web::Json<VerifyProofRequest>,
) -> impl Responder {
    tracing::info!("Received verify-proof request for maze seed: {}", req.path_proof.maze_seed);

    // Cryptographically verify the receipt
    match verify_path_proof_receipt(&req.path_proof) {
        Ok(()) => {
            tracing::info!(
                "Receipt verified successfully: valid={}, seed={}",
                req.path_proof.is_valid,
                req.path_proof.maze_seed
            );

            HttpResponse::Ok().json(VerifyProofResponse {
                success: true,
                is_valid: req.path_proof.is_valid,
                maze_seed: req.path_proof.maze_seed,
                error: None,
            })
        }
        Err(e) => {
            tracing::error!("Receipt verification failed: {}", e);
            HttpResponse::InternalServerError().json(VerifyProofResponse {
                success: false,
                is_valid: false,
                maze_seed: req.path_proof.maze_seed,
                error: Some(e.to_string()),
            })
        }
    }
}

/// GET /health
/// Health check endpoint
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "risc0-maze-api"
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::filter::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tracing::info!("Starting RISC Zero Maze API Server");

    let bind_address = "0.0.0.0:8080";
    tracing::info!("Binding to {}", bind_address);

    HttpServer::new(|| {
        // Configure CORS to allow all origins (matching the Noir worker configuration)
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .expose_any_header()
            .max_age(86400);

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .app_data(web::JsonConfig::default().limit(10_485_760)) // 10MB limit
            .route("/health", web::get().to(health))
            .route("/api/generate-maze", web::post().to(generate_maze))
            .route("/api/verify-path", web::post().to(verify_path))
            .route("/api/verify-proof", web::post().to(verify_proof))
    })
    .bind(bind_address)?
    .run()
    .await
}
