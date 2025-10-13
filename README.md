# Noir Maze Challenge

A zero-knowledge proof-based maze game built with Noir, React, and Cloudflare Workers. Players navigate through a maze and generate cryptographic proofs that they completed it without revealing their solution path.

## Overview

This project demonstrates a complete ZK proof application stack:
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 for the interactive maze game
- **Zero-Knowledge Proofs**: Noir circuits that verify maze completion without exposing the solution
- **Backend**: Rust-based Axum server in Cloudflare Containers using Barretenberg CLI for proof generation
- **Deployment**: Cloudflare Pages for static assets and Workers with Containers for compute

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                        │
│  - Maze rendering and player controls                           │
│  - Local proof generation (in-browser via WASM)                 │
│  - Remote proof API calls                                       │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─── Local Mode: Noir.js + bb.js (WebAssembly)
             │
             └─── Remote Mode: /api/prove
                               │
┌──────────────────────────────┴────────────────────────────────┐
│  Cloudflare Worker (Hono)                                     │
│  - Request routing and CORS                                   │
│  - Timeout management (30s health, 120s prove)                │
└────────────┬──────────────────────────────────────────────────┘
             │
             ├─── Durable Objects (Container Management)
             │
┌────────────┴──────────────────────────────────────────────────┐
│  Cloudflare Container (Rust + Axum)                           │
│  - Axum HTTP server                                           │
│  - bb CLI proof generation (90s timeout)                      │
│  - Witness file management with auto-cleanup                  │
│  - Multi-core CPU utilization                                 │
└───────────────────────────────────────────────────────────────┘
```

### Directory Structure

- `src/` - React frontend application with game UI and proof logic
- `circuit/` - Noir ZK circuit implementation and tests
- `worker/` - Cloudflare Worker (Hono router) and Container configuration
- `worker/container_src/` - Rust Axum server running inside Cloudflare Container

## Prerequisites

- **Node.js 22+** - JavaScript runtime
- **pnpm** - Fast, disk space efficient package manager
- **[Nargo](https://noir-lang.org/docs/getting_started/installation/)** - Noir toolchain (current: 1.0.0-beta.13)
- **Python 3** - For deterministic maze generation
- **Cloudflare account** - For production deployment (free tier works)
- **[Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)** - Cloudflare's deployment tool
- **Rust 1.90+** (optional) - Only needed if modifying the container server

## Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Generate the Maze

Generate the maze configuration:

```bash
pnpm run generate
```

This creates the maze layout and updates the circuit configuration files.

### 3. Compile the Noir Circuit

The circuit must be compiled before running the application:

```bash
pnpm run compile
```

This compiles the Noir circuit in `circuit/src/main.nr` and copies the output to `worker/container_src/circuit.json`.

### 4. Run Development Server

```bash
pnpm run dev
```

This starts the Vite development server. The frontend will be available at `http://localhost:5173`.

### 5. Proof Generation Modes

The application supports two proof generation methods, selectable via a checkbox in the UI:

**Local Proving (In-Browser)**
- Runs proof generation in your browser using WebAssembly
- Works offline and keeps your solution completely private
- Takes 30-60 seconds on most devices
- Best for: Privacy, offline use, or testing

**Remote Proving (Cloudflare Containers)**
- Sends witness data to Cloudflare Containers for proof generation
- Leverages multi-core CPUs for faster proof generation (10-20 seconds)
- Requires internet connection and deployment
- Best for: Production use, faster proofs, or lower-end devices

You can toggle between modes at any time using the "Solve Locally (in-browser)" checkbox in the game interface.

## Production Deployment

### Build the Project

```bash
pnpm run build
```

This:
1. Type-checks the TypeScript code
2. Builds the React application for production
3. Prepares assets for deployment

### Deploy to Cloudflare

```bash
pnpm run deploy
```

This command:
1. Builds the project
2. Deploys the frontend to Cloudflare Pages
3. Deploys the Worker and Container to Cloudflare
4. Configures Durable Objects for the Container instances

The deployment includes:
- Static assets served via Cloudflare Pages
- API endpoints at `/api/*` handled by Cloudflare Workers
- Containerized Noir proof server with automatic scaling (max 10 instances)
- Durable Objects for stateful container management

### Container Architecture & Dockerfiles

The project includes two Dockerfile configurations to support different development and deployment environments:

#### `Dockerfile` (Production - AMD64)
- **Platform**: `linux/amd64` (x86_64 architecture)
- **Purpose**: Production deployment on Cloudflare infrastructure
- **Why AMD64**: Cloudflare requires AMD64 containers for deployment
- **Build Stages**:
  1. Rust compilation targeting `x86_64-unknown-linux-gnu`
  2. Barretenberg AMD64 binary download
  3. Ubuntu 24.04 runtime with CRS warmup

#### `Dockerfile.dev` (Local Development - ARM64)
- **Platform**: `linux/arm64` (aarch64 architecture)
- **Purpose**: Local testing on Apple Silicon (M1/M2/M3) Macs
- **Why ARM64**: Native performance on ARM-based development machines
- **Build Stages**:
  1. Rust compilation targeting `aarch64-unknown-linux-gnu`
  2. Barretenberg ARM64 binary download
  3. Ubuntu 24.04 runtime with CRS warmup

**Key Difference**: The only architectural differences are:
- `--platform` flag (amd64 vs arm64)
- Rust target triple (x86_64 vs aarch64)
- Barretenberg binary variant (amd64-linux vs arm64-linux)

**Local Development Note**: If you're developing on an ARM-based Mac (Apple Silicon), you should use `Dockerfile.dev` for local container testing with `wrangler dev`. The `wrangler.jsonc` configuration automatically selects the correct Dockerfile based on the environment (`dev` uses `Dockerfile.dev`, production uses `Dockerfile`).

**CRS Warmup**: Both Dockerfiles include a build-time warmup step that pre-downloads the Barretenberg Common Reference String (CRS) files. This eliminates the 15-20 second delay on first proof generation, ensuring consistent ~5s proof times from the start.

### Environment Configuration

The deployment is configured in `wrangler.jsonc`:
- Container uses `standard-4` instance type (4 CPU cores, 4GB RAM)
- Auto-scales from 1 to 10 instances based on demand
- Containers sleep after 5 minutes of inactivity
- Two environments:
  - **dev**: Uses `Dockerfile.dev` for ARM64 local testing
  - **production**: Uses `Dockerfile` for AMD64 Cloudflare deployment

## Available Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview production build locally
- `pnpm run deploy` - Build and deploy to Cloudflare
- `pnpm run compile` - Compile Noir circuit
- `pnpm run test` - Run Noir circuit tests
- `pnpm run generate` - Generate new maze with Python script
- `pnpm run lint` - Lint code with ESLint
- `pnpm run typecheck` - Type-check without emitting files

## Noir Circuit

The zero-knowledge circuit (`circuit/src/main.nr`) proves that a player successfully navigated from start to end through a valid path in the maze.

### Security Model

The circuit validates:
1. **Maze identity**: Verifies the correct `maze_seed` (prevents proof reuse across different mazes)
2. **Fixed start position**: All solutions must begin at the designated start coordinates
3. **Sequential movement**: Each move changes position by exactly +/- 1 in one direction
4. **Bounds checking**: All positions must be within the 41×41 maze grid
5. **Wall collision detection**: Every position in the path must be a valid cell (value=1)
6. **Goal achievement**: The path must reach the designated end position
7. **Move limit**: No more than 500 moves allowed

### Implementation Details

- **Direction encoding**: 0=North, 1=East, 2=South, 3=West
- **Invalid moves**: Invalid direction values result in no-op moves (position unchanged), which is secure because they cannot help reach the goal or bypass security checks
- **Optimization**: Uses arithmetic operations instead of branching, saving ~3,500 gates while maintaining cryptographic soundness
- **Underflow protection**: Bounds checking catches u8 underflow attempts (e.g., position 0 + NORTH = 255, which fails the bounds check)

### Public and Private Inputs

Public inputs:
- `maze_seed` - Unique identifier for the maze configuration

Private inputs:
- `moves` - Array of up to 500 directional moves (0=North, 1=East, 2=South, 3=West)

## Generating New Mazes

To generate a new maze configuration:

```bash
pnpm run generate
```

This runs `generate_maze.py` which creates a new 41×41 maze and updates the circuit configuration. After generating a new maze, you must recompile the circuit:

```bash
pnpm run compile
```

## API Endpoints

The production deployment exposes these API endpoints:

- `GET /api/` - Service information and list of available endpoints
- `GET /api/health` - Health check with system info
- `POST /api/witness` - Generate witness from circuit inputs
- `POST /api/prove` - Generate ZK proof from witness
- `POST /api/verify` - Verify a ZK proof

All binary data in requests/responses is base64 encoded.

## Testing

Run the Noir circuit tests:

```bash
pnpm run test
```

This executes the test cases defined in `circuit/src/test_solutions.nr`.

## Technology Stack

### Frontend
- **React 19** - Latest React with concurrent features
- **Vite 7** - Lightning-fast build tool and dev server
- **Tailwind CSS 4** - Utility-first CSS framework
- **TypeScript 5.9** - Type-safe JavaScript

### Zero-Knowledge Proofs
- **Noir 1.0.0-beta.13** - Domain-specific language for ZK circuits
- **Barretenberg (bb) 0.85.0** - Aztec's proving system
  - CLI version in containers for native performance
  - bb.js (WebAssembly) in browser for local proving
- **UltraHonk** - Modern proving system with recursion support
- **@noir-lang/noir_js 1.0.0-beta.9** - Witness generation in JavaScript/WASM

### Backend
- **Rust 1.90** - Systems programming language for container server
- **Axum** - Ergonomic, modular web framework for Rust
- **Hono** - Ultra-fast TypeScript web framework for Workers
- **Cloudflare Workers** - Serverless JavaScript runtime at the edge
- **Cloudflare Containers** - Containerized compute with Durable Objects
- **Ubuntu 24.04** - Container base image (GLIBC 2.38+ required by bb)

### Development Tools
- **Python 3** - Maze generation with deterministic Park-Miller PRNG
- **Wrangler 4** - Cloudflare's CLI for deployment and local dev
- **pnpm** - Efficient package manager with content-addressable storage

## Performance Notes

- **Local proving** (in-browser): Takes 30-60 seconds on most devices, works offline, completely private
- **Remote proving** (Cloudflare Containers): 10-20 seconds with multi-core CPU access, requires deployment
- Users can toggle between local and remote proving at any time via the UI
- Container instances automatically scale based on demand (1-10 instances)
- Proofs are generated using the UltraHonk proving system with multi-threading support

## License

See LICENSE file for details.
