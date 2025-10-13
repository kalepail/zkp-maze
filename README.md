# Noir Maze Challenge

Zero-knowledge maze game where players prove they solved a maze without revealing their solution.

## Architecture

```
┌─────────────────┐
│  React Frontend │ (Cloudflare Pages)
│   Vite + React  │
└────────┬────────┘
         │ API calls
         ↓
┌─────────────────┐
│ Cloudflare      │ (Hono API)
│ Worker          │
└────────┬────────┘
         │ Proxy
         ↓
┌─────────────────┐
│   Container     │ (Rust + Axum)
│  Barretenberg   │
│    bb prove     │
└─────────────────┘
```

## Components

### Frontend (`src/`)

React app with:
- Interactive maze visualization
- Move recording and playback
- Proof generation UI
- Cloudflare Pages deployment

**Key files:**
- `src/App.tsx` - Main application
- `src/components/` - UI components
- `src/hooks/` - Custom React hooks
- `src/utils/` - Helper functions

See [deployment](#deployment) for running locally and deploying.

### Circuit (`circuit/`)

Noir zero-knowledge circuit that verifies maze solutions.

**What it does:**
- Verifies path from start (1,1) to end (40,40)
- Checks bounds, walls, and sequential movement
- Outputs validity proof without revealing moves

See [circuit/README.md](./circuit/README.md) for details.

### Worker (`worker/`)

Cloudflare Worker with container running Barretenberg CLI for proof generation.

**Components:**
- `index.ts` - Hono API server
- `container_src/` - Rust service running bb CLI
- `Dockerfile` - Container configuration

**API endpoints:**
- `POST /api/prove` - Generate ZK proof
- `GET /api/health` - Health check

See [worker/README.md](./worker/README.md) for details.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- [Noir](https://noir-lang.org/) 1.0.0-beta.9+
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg) CLI
- [Docker](https://www.docker.com/) (for worker)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (for deployment)

### Setup

```bash
# Install dependencies
pnpm install

# Generate maze with default seed (2918957128)
pnpm run generate

# Build circuit and run tests
pnpm run nargo
```

The `nargo` script runs the complete circuit workflow:
1. `compile` - Compiles circuit and copies `circuit.json` to worker
2. `execute` - Generates witness and copies `circuit.gz` to worker
3. `prove` - Generates proof locally and copies CRS files to worker
4. `nargo test` - Runs circuit tests

Individual scripts available if needed:
- `pnpm run compile` - Just compile circuit
- `pnpm run execute` - Just generate witness
- `pnpm run prove` - Just generate proof

### Run Frontend

```bash
# Development server
pnpm run dev

# Production build
pnpm run build

# Preview production build
pnpm run preview
```

Frontend runs on `http://localhost:5173` by default.

### Run Worker Locally

See [worker/README.md](./worker/README.md#local-development) for detailed instructions.

```bash
cd worker
docker build -t noir-worker -f Dockerfile.dev .
docker run -p 8080:8080 noir-worker
```

Worker runs on `http://localhost:8080`.

### Generate Maze

**Use existing seed (2918957128):**
```bash
pnpm run generate  # Generates with default seed
pnpm run nargo     # Build circuit
```

**Generate new maze with custom seed:**
```bash
python3 generate_maze.py <your-seed> --no-preview
pnpm run nargo     # Build circuit
```

Both update `circuit/src/maze_config.nr` and `circuit/Prover.toml`, then you rebuild with `pnpm run nargo`.

## Deployment

### Deploy Frontend (Cloudflare Pages)

```bash
# Build and deploy
pnpm run deploy
```

This deploys to Cloudflare Pages. Configure domains in Cloudflare dashboard.

**Environment:**
- Platform: Cloudflare Pages
- Build command: `pnpm run build`
- Output directory: `dist`

### Deploy Worker (Cloudflare Workers + Container)

See [worker/README.md](./worker/README.md#deployment) for detailed instructions.

```bash
cd worker

# Build and push container
docker build -t <registry>/noir-worker .
docker push <registry>/noir-worker

# Deploy worker
wrangler deploy
```

**Requirements:**
- Container registry (Docker Hub, GitHub Container Registry, etc.)
- Cloudflare Workers Paid plan (for containers)

### Environment Variables

**Frontend** (`CLOUDFLARE_ENV`):
- `dev` - Local development
- `` - Production

Set in `package.json` scripts or CI/CD.

**Worker**:
Configure container binding in `wrangler.toml` (auto-generated on deploy):
```toml
[[container]]
binding = "MY_CONTAINER"
image = "<registry>/noir-worker:latest"
```

## Development Workflow

**First time setup:**
```bash
# 1. Generate maze with default seed (2918957128)
pnpm run generate

# 2. Build and test circuit
pnpm run nargo

# 3. Start frontend
pnpm run dev
```

**Generate new maze:**
```bash
# Use custom seed
python3 generate_maze.py <your-seed> --no-preview

# Rebuild circuit
pnpm run nargo

# Restart frontend to load new maze
pnpm run dev
```

**Optional - run worker locally:**
```bash
cd worker
docker build -t noir-worker -f Dockerfile.dev .
docker run -p 8080:8080 noir-worker
```

**Iterating on circuit changes:**
```bash
pnpm run compile  # After circuit code changes
pnpm run execute  # After Prover.toml changes
cd circuit && nargo test  # Run tests only
```

## Scripts Reference

**Frontend:**
```bash
pnpm run dev          # Start frontend dev server
pnpm run build        # Build frontend for production
pnpm run preview      # Preview production build
pnpm run deploy       # Build and deploy frontend
```

**Circuit:**
```bash
pnpm run nargo        # Complete workflow: compile → execute → prove → test
pnpm run generate     # Generate maze with seed 2918957128
pnpm run compile      # Compile circuit, copy circuit.json to worker
pnpm run execute      # Generate witness, copy circuit.gz to worker
pnpm run prove        # Generate proof locally, copy CRS to worker
```

For custom seeds, use `python3 generate_maze.py <seed> --no-preview` instead of `pnpm run generate`.

**Development:**
```bash
pnpm run types        # Generate Wrangler types
pnpm run lint         # Lint code
pnpm run typecheck    # Type check code
```

## Project Structure

```
noir-maze-challenge/
├── circuit/              # Noir ZK circuit
│   ├── src/
│   │   ├── main.nr          # Circuit logic
│   │   ├── maze_config.nr   # Generated maze
│   │   └── test_solutions.nr
│   ├── target/              # Build artifacts
│   └── README.md
├── worker/               # Cloudflare Worker + Container
│   ├── container_src/       # Rust service
│   │   └── src/main.rs
│   ├── index.ts             # Hono API
│   ├── Dockerfile           # Production
│   ├── Dockerfile.dev       # Development
│   └── README.md
├── src/                  # React frontend
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── generate_maze.py      # Maze generator
└── package.json
```

## Troubleshooting

**Frontend won't start**:
```bash
# Clear cache and reinstall
rm -rf node_modules dist .vite
pnpm install
```

**Circuit compilation fails**:
```bash
# Check Noir version
nargo --version  # Should be 1.0.0-beta.9+

# Clean and rebuild
cd circuit && rm -rf target && nargo compile
```

**Worker container won't build**:
```bash
# Check Docker is running
docker info

# Clean build cache
docker system prune -a
```

**Proof generation fails**:
- Ensure `circuit.json` and `circuit.gz` exist in `worker/container_src/`
- Check container logs: `docker logs <container-id>`
- Verify bb CLI is in container: `docker run noir-worker bb --version`

## Resources

- [Noir Documentation](https://noir-lang.org/)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers](https://developers.cloudflare.com/workers/runtime-apis/containers/)
