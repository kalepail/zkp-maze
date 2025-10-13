# Worker V2 - Rust + Barretenberg CLI

A high-performance ZK proof generation worker using Rust and the Barretenberg CLI (`bb`) executable.

## Architecture

- **Runtime**: Rust 1.90 with Tokio async runtime
- **HTTP Framework**: Axum 0.8 (built on Tokio/Hyper)
- **Proof Backend**: Barretenberg CLI (`bb` executable)
- **Platform**: Multi-arch (linux/amd64, linux/arm64)
- **Container**: Cloudflare Containers

## Key Features

- **Blazing fast performance** with Rust and async I/O
- Native async subprocess execution with Tokio
- Zero-cost abstractions and minimal runtime overhead
- Extremely small attack surface with minimal dependencies
- Type-safe request/response handling with Axum
- Only provides `/prove` endpoint (witness generation happens client-side)
- Graceful shutdown with signal handling
- Optimized release builds (LTO, single codegen unit, stripped binaries)

## Endpoints

### `GET /api/health`
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "architecture": "x86_64",
  "bb": {
    "available": true,
    "version": "0.84.0",
    "binary_arch": "/usr/local/bin/bb: ELF 64-bit LSB executable, x86-64..."
  },
  "timestamp": "2025-01-11T00:00:00.000Z"
}
```

### `POST /api/prove`
Generate a ZK proof from a witness

**Request:**
- Content-Type: `application/gzip` (or binary)
- Body: Raw gzipped witness binary data

**Response:**
```json
{
  "success": true,
  "proof": "<base64 encoded proof>"
}
```

**Error Response:**
```json
{
  "error": "Proof generation failed",
  "message": "bb prove failed: ..."
}
```

## Local Development

### Build the Docker image:

**For native architecture (auto-detect - recommended for local dev):**
```bash
docker build -t worker-v2 -f worker-v2/Dockerfile.dev worker-v2
```

**For specific architecture:**
```bash
# For ARM64 (Apple Silicon Macs)
docker build -f worker-v2/Dockerfile.dev -t worker-v2 worker-v2

# For AMD64 (production/Intel Macs)
docker build -f worker-v2/Dockerfile -t worker-v2 worker-v2
```

### Run locally:
```bash
docker run -p 8080:8080 worker-v2
```

### Test the endpoints:
```bash
# Health check
curl http://localhost:8080/api/health

# Generate proof (requires valid gzipped witness as binary body)
curl -X POST http://localhost:8080/api/prove \
  --data-binary @witness.gz \
  -H "Content-Type: application/gzip"
```

## Deployment

This worker is designed to be deployed as a Cloudflare Container. The `index.ts` file provides the Cloudflare Worker integration.

## Best Practices Applied

1. **Modern Rust async** - Using Axum + Tokio for efficient async I/O
2. **Multi-stage builds** - Separate build and runtime stages
3. **Minimal base images** - Using rust:slim and ubuntu:24.04 minimal
4. **Layer caching optimization** - Dependencies cached before code copy
5. **Security** - No hardcoded secrets, minimal dependencies
6. **Multi-architecture support** - Builds for both amd64 and arm64
7. **Graceful shutdown** - SIGTERM/SIGINT handling with Tokio
8. **Unique request IDs** - UUID v4-based file naming to avoid collisions
9. **Automatic cleanup** - Async cleanup of temporary witness files
10. **Release optimizations** - LTO, optimized codegen, stripped binaries

## File Structure

```
worker-v2/
├── Dockerfile                 # Production multi-stage build (AMD64)
├── Dockerfile.dev             # Development build (ARM64)
├── index.ts                   # Cloudflare Worker integration
├── README.md                  # This file
├── .dockerignore              # Docker ignore patterns
└── container_src/
    ├── Cargo.toml             # Rust dependencies
    ├── src/
    │   └── main.rs            # Axum HTTP server
    └── circuit.json           # Noir circuit bytecode
```

## Implementation Details

The server:
- Listens on port 8080 with Tokio TCP listener
- Accepts gzipped witness data as raw binary body
- Asynchronously writes witness to `/tmp/bb-proofs/<uuid>.witness.gz`
- Executes: `bb prove -b circuit.json -w <witness> -o -` (outputs to stdout)
- Captures stdout asynchronously, encodes to base64, returns as JSON
- Automatically cleans up temporary files after proof generation
- Uses Axum for routing and Tokio for async subprocess execution
- 120-second timeout layer for long-running proof generation

## Performance Characteristics

Rust brings significant performance improvements:
- **Lower memory footprint** - No GC overhead, predictable memory usage
- **Faster startup time** - Compiled binary, no runtime initialization
- **Better concurrency** - Tokio's work-stealing scheduler
- **Zero-cost abstractions** - High-level code with low-level performance
- **Smaller binary size** - Stripped release builds (~5-10MB)

## Migration from Go

This implementation replaces the Go-based server with Rust for:
- Even better performance and lower memory footprint than Go
- More advanced async ecosystem with Tokio
- Stronger type safety and compile-time guarantees
- Modern HTTP framework (Axum) with excellent ergonomics
- Industry-standard approach for high-performance services
