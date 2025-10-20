# RISC Zero Maze API Server

REST API server for generating and verifying maze proofs using RISC Zero zkVM.

## Endpoints

### POST /api/generate-maze
Generate a maze proof from a seed.

**Request:**
```json
{
  "seed": 2918957128
}
```

**Response:**
```json
{
  "success": true,
  "maze_proof": {
    "maze_seed": 2918957128,
    "grid_hash": [/* 32 bytes */],
    "grid_data": [/* 20x20 grid */],
    "receipt": {/* zkVM receipt */}
  }
}
```

### POST /api/verify-path
Generate a path verification proof given a maze proof and moves.

**Request:**
```json
{
  "maze_proof": {
    "maze_seed": 2918957128,
    "grid_hash": [/* 32 bytes */],
    "grid_data": [/* 20x20 grid */],
    "receipt": {/* zkVM receipt */}
  },
  "moves": [1, 1, 2, 2, 3, 3, 0, 0]
}
```

**Response:**
```json
{
  "success": true,
  "path_proof": {
    "is_valid": true,
    "maze_seed": 2918957128,
    "receipt": {/* zkVM receipt */}
  }
}
```

### POST /api/verify-proof
Verify a path proof (checks the cryptographic proof).

**Request:**
```json
{
  "path_proof": {
    "is_valid": true,
    "maze_seed": 2918957128,
    "receipt": {/* zkVM receipt */}
  }
}
```

**Response:**
```json
{
  "success": true,
  "is_valid": true,
  "maze_seed": 2918957128
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "risc0-maze-api"
}
```

## Building

### Local Development
```bash
cd circuit-risczero/api-server
cargo build --release
cargo run --release
```

### Docker

Two Dockerfiles are provided:
- **Dockerfile** - Production build for x86_64 (automated `rzup` installation)
- **Dockerfile.dev** - Development build for any architecture (manual toolchain build)

#### Development (Any Architecture)
Builds RISC Zero toolchain from source for your host architecture (ARM64/x86_64):
```bash
cd circuit-risczero/api-server
docker-compose --profile dev up

# Or build manually
cd circuit-risczero
docker build -f api-server/Dockerfile.dev -t risc0-maze-api:dev .
docker run -p 8080:8080 risc0-maze-api:dev
```

> **Note**: First build takes 15-30 minutes as it compiles the RISC Zero toolchain from source. Subsequent builds use Docker layer caching.

#### Production (x86_64)
Uses automated `rzup` installer (faster, x86_64 only):
```bash
cd circuit-risczero/api-server
docker-compose --profile prod up

# Or build manually
cd circuit-risczero
docker build -f api-server/Dockerfile -t risc0-maze-api:latest .
docker run -p 8080:8080 risc0-maze-api:latest
```

## Environment Variables

- `RUST_LOG` - Set logging level (default: info)
  - Example: `RUST_LOG=debug`

## Architecture

The API server wraps the RISC Zero maze proof system with three main operations:

1. **Maze Generation** - Creates a cryptographic proof that a maze was correctly generated from a seed
2. **Path Verification** - Proves that a given path successfully navigates through the maze
3. **Proof Verification** - Validates the cryptographic proof of a path

Each proof is generated using the RISC Zero zkVM, ensuring tamper-proof verification.

## Performance Notes

- Proof generation can take several seconds to minutes depending on the complexity
- The server runs on a single thread per request (proof generation is CPU-intensive)
- Consider using a queue system for production deployments to handle concurrent requests
