# Noir Maze Challenge

Zero-knowledge maze game where players prove they solved a maze without revealing their solution path.

## Overview

This project demonstrates zero-knowledge proofs using Noir circuits and Barretenberg. Players navigate a procedurally generated maze and generate cryptographic proofs that they found a valid solution without revealing their specific moves.

**Implementations:**
- **Noir (Barretenberg)** - Production implementation with Cloudflare Worker deployment
- **RISC Zero** - Alternative zkVM implementation (see [circuit-risczero/](./circuit-risczero/))

## Architecture

```
┌─────────────────┐
│  React Frontend │  Vite + React (Cloudflare Pages)
│   + Maze UI     │  Interactive visualization
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│ Cloudflare      │  Hono API (POST /api/prove)
│ Worker          │  Proxies to container
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Container       │  Rust + Axum
│ Barretenberg    │  bb prove (ZK proof generation)
└─────────────────┘
```

## Components

### Frontend (`src/`)

React application with interactive maze solving interface.

**Features:**
- Visual maze grid with start/end positions
- Click-to-move controls with move recording
- Proof generation and verification UI
- Real-time feedback on solution validity

**Tech stack:** React, TypeScript, Vite, Cloudflare Pages

### Circuit (`circuit-noir/`)

Noir zero-knowledge circuit for maze solution verification.

**Proves:**
- Valid path from start (1,1) to end (40,40)
- No wall collisions, bounds violations, or invalid moves
- Solution correctness WITHOUT revealing the actual moves

See [circuit-noir/README.md](./circuit-noir/README.md)

### Maze Generator (`circuit-noir-maze-gen/`)

Procedural maze generation using Park-Miller LCG and recursive backtracker algorithm.

**Features:**
- Deterministic generation from seed
- Generates 20×20 cell mazes (41×41 grid with walls)
- BFS solver for validation

See [circuit-noir-maze-gen/README.md](./circuit-noir-maze-gen/README.md)

### Worker (`worker/`)

Cloudflare Worker + Container running Barretenberg CLI for proof generation.

**Components:**
- Hono API server (`index.ts`)
- Rust proof service (`container_src/`)
- Dockerized Barretenberg environment

**Endpoints:**
- `POST /api/prove` - Generate ZK proof from moves
- `GET /api/health` - Container health check

See [worker/README.md](./worker/README.md)

## Quick Start

### Prerequisites

```bash
# Required
- Node.js 18+
- pnpm 9+
- Noir CLI (noirup)

# Optional (for worker/deployment)
- Docker
- Wrangler CLI
```

Install Noir:
```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.9
```

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Generate maze (uses default seed 2918957128)
pnpm run generate

# 3. Build circuit
pnpm run nargo
```

The `nargo` script runs:
- `nargo compile` → Compiles circuit, copies `circuit.json` to worker
- `nargo execute` → Generates witness, copies `circuit.gz` to worker
- `bb prove` → Generates proof, copies CRS files to worker
- `nargo test` → Runs circuit tests

### Run Development Server

```bash
pnpm run dev
```

Frontend runs on `http://localhost:5173`

### Generate New Maze

```bash
# With custom seed
python3 generate_maze.py <seed> --no-preview

# Rebuild circuit
pnpm run nargo
```

This updates `circuit-noir/src/maze_config.nr` and `circuit-noir/Prover.toml` with the new maze configuration.

## Deployment

### Frontend (Cloudflare Pages)

```bash
pnpm run deploy
```

**Configuration:**
- Build command: `pnpm run build`
- Output directory: `dist`
- Environment variable: `CLOUDFLARE_ENV` (optional)

### Worker (Cloudflare Workers + Container)

See [worker/README.md](./worker/README.md#deployment)

**Requirements:**
- Docker registry (Docker Hub, GHCR, etc.)
- Cloudflare Workers Paid plan

```bash
cd worker

# Build and push container
docker build -t <registry>/noir-worker .
docker push <registry>/noir-worker

# Deploy worker
wrangler deploy
```

Update `wrangler.toml` with your container image.

## Scripts

### Frontend
```bash
pnpm run dev      # Start dev server (localhost:5173)
pnpm run build    # Build for production
pnpm run preview  # Preview production build
pnpm run deploy   # Deploy to Cloudflare Pages
```

### Circuit
```bash
pnpm run nargo    # Full workflow: compile → execute → prove → test
pnpm run generate # Generate maze (default seed 2918957128)
pnpm run compile  # Compile circuit only
pnpm run execute  # Generate witness only
pnpm run prove    # Generate proof only
```

For custom seeds: `python3 generate_maze.py <seed> --no-preview`

### Development
```bash
pnpm run typecheck  # Type checking
pnpm run lint       # Lint code
pnpm run types      # Generate Wrangler types
```

## Project Structure

```
noir-maze-challenge/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
│   └── utils/              # Helper functions
├── circuit-noir/           # Noir circuit (production)
│   ├── src/
│   │   ├── main.nr             # Circuit logic
│   │   ├── maze_config.nr      # Generated maze data
│   │   └── test_solutions.nr   # Test cases
│   └── target/                 # Compiled artifacts
├── circuit-noir-maze-gen/  # Maze generation library
│   └── src/
│       ├── maze_generator.nr   # Maze generation algorithm
│       └── rng.nr              # Park-Miller LCG
├── circuit-risczero/       # RISC Zero implementation (alternative)
│   ├── core/               # Shared logic (no_std)
│   ├── host/               # Prover
│   └── methods/            # Guest programs (zkVM)
├── worker/                 # Cloudflare Worker + Container
│   ├── index.ts            # Hono API
│   ├── container_src/      # Rust proof service
│   └── Dockerfile          # Container config
├── generate_maze.py        # Python maze generator
└── package.json
```

## Troubleshooting

**Circuit compilation fails:**
```bash
nargo --version  # Verify 1.0.0-beta.9+
cd circuit-noir && rm -rf target && nargo compile
```

**Frontend won't start:**
```bash
rm -rf node_modules dist .vite && pnpm install
```

**Worker issues:**
```bash
# Check Docker running
docker info

# Verify bb CLI in container
docker run noir-worker bb --version

# Check logs
docker logs <container-id>
```

## Resources

- [Noir Documentation](https://noir-lang.org/)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [RISC Zero](https://dev.risczero.com/)
