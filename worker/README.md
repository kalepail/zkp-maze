# Cloudflare Worker + Container

Zero-knowledge proof generation service using Cloudflare Workers and containerized Barretenberg CLI.

## Overview

This service generates ZK proofs for maze solutions using a two-tier architecture:

1. **Cloudflare Worker** - Hono API that proxies requests
2. **Container** - Rust service running Barretenberg CLI

**Why containers?** Barretenberg CLI requires native binaries and CRS files (~100MB), which exceed Worker limits. Containers provide isolated environments with full system access.

## Architecture

```
Client (Frontend)
  ↓ POST /api/prove (witness data)
  ↓
Cloudflare Worker (index.ts)
  ↓ Hono API + CORS
  ↓ Proxy request
  ↓
Container (Rust + Axum)
  ↓ Stream witness → /tmp
  ↓ Execute: bb prove -b circuit.json -w witness
  ↓ Stream proof bytes
  ↓ Cleanup temp files
  ↓
Client (Frontend)
  ← Proof bytes (application/octet-stream)
```

## Components

### Worker (`index.ts`)

Lightweight Hono-based API:

**Endpoints:**
- `POST /api/prove` - Proxy to container (2min timeout)
- `GET /api/health` - Container health check

**Features:**
- CORS enabled for all origins
- Request logging
- Error handling and timeout protection

### Container (`container_src/`)

Rust service wrapping Barretenberg CLI:

**Files:**
- `src/main.rs` - Axum HTTP server + bb CLI wrapper
- `Cargo.toml` - Dependencies (axum, tokio, uuid)
- `circuit.json` - Compiled circuit (from `circuit-noir/`)
- `.bb-crs/` - Trusted setup files (bundled in image)

**Proof Generation Flow:**
1. Receive witness via streaming upload
2. Save to `/tmp/bb-proofs/{uuid}.witness`
3. Execute `bb prove -b circuit.json -w witness -o - -c ~/.bb-crs`
4. Stream proof bytes to client
5. Clean up witness file

**Endpoints:**
- `POST /api/prove` - Generate proof from witness
- `GET /api/health` - Return bb version + CRS status

## Quick Start

### Prerequisites

- Docker 20+
- Wrangler 4+ (for deployment)

### Build and Run

```bash
# Build development container
docker build -t noir-worker -f Dockerfile.dev .

# Run container
docker run -p 8080:8080 noir-worker
```

Container runs on `http://localhost:8080`

### Test

```bash
# Health check
curl http://localhost:8080/api/health

# Generate proof (requires witness from circuit-noir/target/)
curl -X POST http://localhost:8080/api/prove \
  -H "Content-Type: application/octet-stream" \
  --data-binary @../circuit-noir/target/circuit.gz \
  --output proof
```

### Workflow

**After circuit changes:**

```bash
# From project root
pnpm run nargo  # Compiles circuit and copies artifacts

# Rebuild container
cd worker
docker build -t noir-worker -f Dockerfile.dev .

# Test
docker run -p 8080:8080 noir-worker
```

Artifacts automatically copied:
- `circuit.json` → `container_src/circuit.json`
- `circuit.gz` → `container_src/circuit.gz`
- `.bb-crs/` → `container_src/.bb-crs/`

### Debug

```bash
# Interactive shell
docker run -it --entrypoint /bin/sh noir-worker

# Check bb version
docker run noir-worker bb --version

# Verify CRS files
docker run noir-worker ls -la ~/.bb-crs

# View logs
docker logs <container-id>
```

## Deployment

### Requirements

- Cloudflare Workers **Paid plan** (containers require paid tier)
- Container registry (Docker Hub, GHCR, etc.)
- Wrangler authenticated: `wrangler login`

### Steps

**1. Build and push container:**

```bash
# Build production image
docker build -t <registry>/noir-worker:latest -f Dockerfile .

# Push to registry
docker push <registry>/noir-worker:latest

# Optional: Tag version
docker tag <registry>/noir-worker:latest <registry>/noir-worker:v1.0.0
docker push <registry>/noir-worker:v1.0.0
```

**2. Configure `wrangler.toml`:**

```toml
name = "noir-maze-worker"
main = "index.ts"
compatibility_date = "2024-10-01"

[[container]]
binding = "MY_CONTAINER"
image = "<registry>/noir-worker:latest"
```

**3. Deploy:**

```bash
wrangler deploy
```

### Update Deployment

```bash
# Build new version
docker build -t <registry>/noir-worker:v1.0.1 -f Dockerfile .
docker push <registry>/noir-worker:v1.0.1

# Update wrangler.toml with new tag
# Deploy
wrangler deploy
```

## Docker Images

### Dockerfile (Production)

Multi-stage build for minimal size:

**Stages:**
1. **Builder** - Compile Rust service (release mode)
2. **BB Installer** - Download and extract Barretenberg CLI
3. **Runtime** - Alpine-based minimal image

**Optimizations:**
- LTO and size optimization flags
- Stripped binaries
- Multi-platform support (amd64/arm64)
- Bundled CRS files (~100MB)

**Size:** ~150MB compressed

### Dockerfile.dev (Development)

Faster build for iteration:
- Debug symbols included
- Faster compilation (no LTO)
- Same runtime behavior

**Size:** ~200MB compressed

## Performance

### Container Specs

**Resources:**
- CPU: 1 core
- Memory: 256MB - 1GB
- Timeout: 120s
- Port: 8080

**Autoscaling:**
- Sleeps after 5min inactivity
- Wakes on request
- Cold start: ~2-5s

### Proof Generation

**Timing:**
- Cold start: ~2-7s total
- Warm: ~2-5s
- Network overhead: ~100-500ms

**Resources:**
- Memory: ~200-500MB
- CPU: Single core
- Output: ~2KB proof

## API

### POST /api/prove

Generate zero-knowledge proof from witness data.

**Request:**
```http
POST /api/prove
Content-Type: application/octet-stream

<witness data (gzipped)>
```

**Response:**
```http
200 OK
Content-Type: application/octet-stream

<proof bytes>
```

**Status codes:**
- `200` - Success
- `400` - Invalid witness
- `500` - Proof generation failed
- `504` - Timeout (>90s)

**Example:**
```bash
curl -X POST http://localhost:8080/api/prove \
  -H "Content-Type: application/octet-stream" \
  --data-binary @circuit.gz \
  --output proof
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "bb_version": "0.85.0",
  "bb_crs_files": "bn254_crs_0.bin\nbn254_crs_1.bin..."
}
```

**Status codes:**
- `200` - Healthy
- `500` - Unhealthy

## Troubleshooting

### Build Issues

**Container won't build:**
```bash
# Clean cache
docker system prune -a

# Build without cache
docker build --no-cache -t noir-worker -f Dockerfile.dev .

# Check Docker version
docker --version  # Requires 20+
```

**Container won't start:**
```bash
# Check logs
docker logs <container-id>

# Run interactively
docker run -it --entrypoint /bin/sh noir-worker

# Verify bb installation
docker run noir-worker bb --version
```

### Proof Generation Issues

**"bb prove failed":**

Circuit or witness invalid. Test locally:
```bash
cd ../circuit-noir
nargo execute
bb prove -b target/circuit.json -w target/circuit.gz -o target/
```

**"bb prove timed out":**

Proof took >90s. Possible causes:
- Circuit too large (>50K gates)
- Resource constraints
- Increase timeout in `main.rs`

**"Failed to write body":**

Witness data corrupt:
```bash
file circuit.gz  # Should be gzip
gunzip -t circuit.gz  # Test integrity
```

### Deployment Issues

**"Container binding failed":**
- Verify registry is public or Cloudflare has access
- Check image tag matches `wrangler.toml`
- Confirm paid plan active

**"Worker exceeds size limit":**
- Worker bundle should be <1MB
- Check: `wrangler publish --dry-run`
- Container is separate from Worker

## Security

**Container isolation:**
- Read-only filesystem (except /tmp)
- No network access from bb CLI
- Automatic temp file cleanup

**API security:**
- CORS enabled (restrict in production)
- Streaming upload with size limits
- Timeout protection (90s bb, 120s HTTP)

**Best practices:**
- Validate witness before sending
- Use HTTPS in production
- Rate limit at Cloudflare level
- Monitor logs for anomalies

## Optimization Tips

- Keep container warm with periodic health checks
- Use connection pooling in frontend
- Cache proofs by witness hash

## Resources

- [Cloudflare Containers](https://developers.cloudflare.com/workers/runtime-apis/containers/)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Axum Documentation](https://docs.rs/axum/)
- [Parent README](../README.md)
