# Worker

Cloudflare Worker with container running Barretenberg CLI for zero-knowledge proof generation.

## Architecture

```
Cloudflare Worker (index.ts)
  ↓ Hono API Layer
  ↓ Proxy requests
  ↓
Container (Rust)
  ↓ Axum HTTP Server
  ↓ Stream witness data
  ↓ Execute bb prove
  ↓ Return proof bytes
```

## Components

### Worker (`index.ts`)

Hono-based API server that proxies to container:

- `POST /api/prove` - Generate ZK proof (2min timeout)
- `GET /api/health` - Container health check
- CORS enabled for all origins
- Request logging and error handling

### Container (`container_src/`)

Rust service using Axum that wraps Barretenberg CLI:

**Files:**
- `src/main.rs` - HTTP server and bb CLI wrapper
- `Cargo.toml` - Rust dependencies
- `circuit.json` - Compiled Noir circuit (copied from circuit/)
- `.bb-crs/` - CRS files for proof generation

**API:**
- `POST /api/prove` - Accepts witness data, returns proof bytes
- `GET /api/health` - Returns bb version and CRS status

**Flow:**
1. Receive witness data via streaming upload
2. Write to `/tmp/bb-proofs/{uuid}.witness`
3. Execute `bb prove -b circuit.json -w witness -o - -c ~/.bb-crs`
4. Stream proof bytes back to client
5. Clean up witness file

## Local Development

### Prerequisites

- [Docker](https://www.docker.com/) 20+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4+

### Build Container

```bash
# Development build (faster, larger)
docker build -t noir-worker:dev -f Dockerfile.dev .

# Production build (optimized, smaller)
docker build -t noir-worker:prod -f Dockerfile .
```

### Run Container

```bash
# Development
docker run -p 8080:8080 noir-worker:dev

# Production
docker run -p 8080:8080 noir-worker:prod

# With custom circuit
docker run -p 8080:8080 \
  -v $(pwd)/container_src/circuit.json:/app/circuit.json \
  noir-worker:dev
```

Container runs on `http://localhost:8080`.

### Test API

```bash
# Health check
curl http://localhost:8080/api/health

# Generate proof (requires witness data)
curl -X POST http://localhost:8080/api/prove \
  -H "Content-Type: application/octet-stream" \
  --data-binary @circuit.gz \
  --output proof
```

### Development Workflow

1. Update circuit in `../circuit/`
2. Copy artifacts to container:
   ```bash
   cp ../circuit/target/circuit.json container_src/
   cp ../circuit/target/circuit.gz container_src/
   ```
3. Rebuild container:
   ```bash
   docker build -t noir-worker:dev -f Dockerfile.dev .
   ```
4. Test locally:
   ```bash
   docker run -p 8080:8080 noir-worker:dev
   ```

### Debug Container

```bash
# Run with shell
docker run -it --entrypoint /bin/sh noir-worker:dev

# Check bb installation
docker run noir-worker:dev bb --version

# Check CRS files
docker run noir-worker:dev ls -la ~/.bb-crs

# View logs
docker logs <container-id>
```

## Deployment

### Prerequisites

- Cloudflare Workers Paid plan (containers require paid plan)
- Container registry (Docker Hub, GitHub Container Registry, etc.)
- Wrangler authenticated (`wrangler login`)

### Push Container

```bash
# Build for production
docker build -t <registry>/noir-worker:latest -f Dockerfile .

# Push to registry
docker push <registry>/noir-worker:latest

# Tag specific version
docker tag <registry>/noir-worker:latest <registry>/noir-worker:v1.0.0
docker push <registry>/noir-worker:v1.0.0
```

### Deploy Worker

```bash
# Deploy with wrangler
wrangler deploy

# Deploy to specific environment
wrangler deploy --env production
```

### Configure Container Binding

Create `wrangler.toml` in worker directory:

```toml
name = "noir-maze-worker"
main = "index.ts"
compatibility_date = "2024-10-01"

[[container]]
binding = "MY_CONTAINER"
image = "<registry>/noir-worker:latest"
```

Then deploy:
```bash
wrangler deploy
```

### Environment Variables

Set in `wrangler.toml`:

```toml
[env.production]
vars = { NODE_ENV = "production" }

[[env.production.container]]
binding = "MY_CONTAINER"
image = "<registry>/noir-worker:v1.0.0"
```

### Update Production

```bash
# Build new version
docker build -t <registry>/noir-worker:v1.0.1 -f Dockerfile .

# Push
docker push <registry>/noir-worker:v1.0.1

# Update wrangler.toml with new tag
# Then deploy
wrangler deploy --env production
```

## Docker Configuration

### Dockerfile (Production)

Multi-stage build:
1. **Builder stage**: Compile Rust service
2. **BB installer**: Download and extract Barretenberg
3. **Runtime stage**: Alpine-based minimal image

**Optimizations:**
- Rust release profile with LTO and size optimization
- Stripped binaries
- Multi-platform support (amd64/arm64)
- CRS files bundled

**Size:** ~150MB compressed

### Dockerfile.dev (Development)

Simpler build for faster iteration:
- Debug symbols included
- Faster compilation
- Same runtime behavior

**Size:** ~200MB compressed

## Container Specs

**Resources:**
- CPU: 1 core (autoscale)
- Memory: 256MB - 1GB (autoscale)
- Timeout: 120s (2 minutes)
- Port: 8080

**Autoscaling:**
- Sleep after 5m inactivity
- Wake on request
- Cold start: ~2-5s

**Proof Generation:**
- Time: 2-5s (warm)
- Memory: ~200-500MB
- Output: ~2KB proof

## API Reference

### POST /api/prove

Generate ZK proof from witness data.

**Request:**
```
Content-Type: application/octet-stream
Body: witness data (gzipped)
```

**Response:**
```
Content-Type: application/octet-stream
Body: proof bytes
```

**Status Codes:**
- `200` - Success
- `400` - Invalid witness data
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

Container health check.

**Response:**
```json
{
  "status": "ok",
  "bb_version": "0.85.0",
  "bb_crs_files": "bn254_crs_0.bin\nbn254_crs_1.bin..."
}
```

**Status Codes:**
- `200` - Container healthy
- `500` - Container unhealthy

## Troubleshooting

### Container won't build

```bash
# Clean Docker cache
docker system prune -a

# Build without cache
docker build --no-cache -t noir-worker:dev -f Dockerfile.dev .

# Check Docker version
docker --version  # Should be 20+
```

### Container won't start

```bash
# Check logs
docker logs <container-id>

# Run interactively
docker run -it --entrypoint /bin/sh noir-worker:dev

# Check bb installation
docker run noir-worker:dev bb --version
```

### Proof generation fails

**"bb prove failed"**: Circuit or witness is invalid
```bash
# Test locally first
cd ../circuit
nargo execute
bb prove -b target/circuit.json -w target/circuit.gz -o target/
```

**"bb prove timed out"**: Proof took >90s
- Circuit is too large (>50k gates)
- Container is resource-constrained
- Increase timeout in `main.rs:26`

**"Failed to write body"**: Witness data is corrupt
```bash
# Verify witness file
file circuit.gz  # Should be gzip compressed
gunzip -t circuit.gz  # Test integrity
```

### Deployment fails

**"Container binding failed"**: Registry not accessible
- Verify image is public or Cloudflare has access
- Check image tag matches `wrangler.toml`
- Confirm paid plan is active

**"Worker exceeds size limit"**: index.ts too large
- Check bundle size: `wrangler publish --dry-run`
- Worker should be <1MB (container is separate)

## Performance

**Cold start:**
- Container wake: ~2-5s
- First request: ~2-7s total

**Warm requests:**
- Proof generation: ~2-5s
- Network overhead: ~100-500ms
- Total: ~2-6s

**Optimization tips:**
- Keep container warm with periodic health checks
- Use connection pooling in frontend
- Cache proofs by witness hash

## Security

**Container isolation:**
- Read-only filesystem (except /tmp)
- No network access from bb CLI
- Automatic cleanup of temp files

**API security:**
- CORS enabled (restrict in production)
- Request size limits (streaming upload)
- Timeout protection (90s bb, 120s HTTP)

**Best practices:**
- Validate witness data before sending
- Use HTTPS in production
- Rate limit at Cloudflare level
- Monitor container logs for anomalies

## Resources

- [Cloudflare Containers](https://developers.cloudflare.com/workers/runtime-apis/containers/)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Axum Documentation](https://docs.rs/axum/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
