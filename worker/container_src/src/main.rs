use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures::TryStreamExt;
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tokio::{
    fs,
    process::Command,
    signal,
    time::timeout,
};
use tokio_util::io::StreamReader;
use tower_http::timeout::TimeoutLayer;
use uuid::Uuid;

const PORT: u16 = 8080;
const TEMP_DIR: &str = "/tmp/bb-proofs";
const CIRCUIT_PATH: &str = "/app/circuit.json";
const BB_PROVE_TIMEOUT: Duration = Duration::from_secs(90); // 90s for proof generation

// Response types
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    bb_available: bool,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Serialize)]
struct NotFoundResponse {
    error: &'static str,
    available_endpoints: &'static [&'static str],
}

// Error type
enum AppError {
    Internal(String),
    BadRequest(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            AppError::Internal(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error",
                msg,
            ),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "Bad request", msg),
        };

        (
            status,
            Json(ErrorResponse {
                error: error,
                message: Some(message),
            }),
        )
            .into_response()
    }
}

#[tokio::main]
async fn main() {
    // Ensure temp directory exists
    fs::create_dir_all(TEMP_DIR)
        .await
        .expect("Failed to create temp directory");

    // Build router
    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/prove", post(prove_handler))
        .fallback(not_found_handler)
        .layer(TimeoutLayer::new(Duration::from_secs(120)));

    // Minimal startup output
    println!("🚀 Server starting on 0.0.0.0:{}", PORT);

    // Create listener
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", PORT))
        .await
        .expect("Failed to bind to port");

    // Serve with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server failed");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn health_handler() -> impl IntoResponse {
    // Fast health check - just verify bb is available
    let bb_available = Command::new("bb")
        .arg("--version")
        .output()
        .await
        .map(|output| output.status.success())
        .unwrap_or(false);

    Json(HealthResponse {
        status: "ok",
        bb_available,
    })
}

async fn prove_handler(request: Request) -> Result<impl IntoResponse, AppError> {
    // Generate unique request ID for file naming
    let request_id = Uuid::new_v4();
    let witness_path = PathBuf::from(TEMP_DIR).join(format!("{}.witness", request_id));

    // Helper to ensure cleanup on all paths
    struct FileGuard {
        path: PathBuf,
    }
    impl Drop for FileGuard {
        fn drop(&mut self) {
            let path = self.path.clone();
            tokio::spawn(async move {
                let _ = fs::remove_file(&path).await;
            });
        }
    }
    let _guard = FileGuard {
        path: witness_path.clone(),
    };

    // Stream body directly to file instead of buffering in memory
    let body_stream = request.into_body().into_data_stream();
    let mut stream_reader = StreamReader::new(
        body_stream.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
    );

    let mut file = fs::File::create(&witness_path)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create witness file: {}", e)))?;

    let bytes_written = tokio::io::copy(&mut stream_reader, &mut file)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to write body: {}", e)))?;

    if bytes_written == 0 {
        return Err(AppError::BadRequest("Empty request body".to_string()));
    }

    // Explicitly sync to ensure bb can read the complete file
    file.sync_all()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to sync witness file: {}", e)))?;

    drop(file);

    // Execute bb prove - returns raw bytes
    let proof_bytes = execute_prove(&witness_path)
        .await
        .map_err(|e| AppError::Internal(format!("Proof generation failed: {}", e)))?;

    // Get the proof data length for Content-Length header
    let content_length = proof_bytes.len();

    // Return binary response with proper headers
    // FileGuard will clean up witness file when function returns
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_LENGTH, content_length)
        .body(Body::from(proof_bytes))
        .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)))
}

async fn execute_prove(witness_path: &PathBuf) -> Result<Vec<u8>, String> {
    let prove_future = Command::new("bb")
        .args(&["prove", "-b", CIRCUIT_PATH, "-w"])
        .arg(witness_path)
        .args(&["-o", "-"])
        .output();

    let output = timeout(BB_PROVE_TIMEOUT, prove_future)
        .await
        .map_err(|_| format!("bb prove timed out after {}s", BB_PROVE_TIMEOUT.as_secs()))?
        .map_err(|e| format!("Failed to execute bb: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "bb prove failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        ));
    }

    Ok(output.stdout)
}

async fn not_found_handler() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(NotFoundResponse {
            error: "Not found",
            available_endpoints: &["/api/health", "/api/prove"],
        }),
    )
}
