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

### 3. Compile and Test the Noir Circuit

The best way to compile, execute, and test the circuit is with a single command:

```bash
pnpm run nargo
```

This command:
1. Compiles the circuit (`nargo compile`)
2. Executes with test inputs (`nargo execute`)
3. Runs all circuit tests (`nargo test`)
4. Copies compiled output to `worker/container_src/`

**Individual commands** (if needed):
```bash
pnpm run compile  # Just compile
pnpm run test     # Just test
```

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
- **`pnpm run nargo`** - **Compile, execute, and test circuit (recommended)**
- `pnpm run compile` - Compile Noir circuit only
- `pnpm run test` - Run Noir circuit tests only
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

The project includes a deterministic maze generator that produces identical mazes from the same seed across Python (circuit generation) and JavaScript (frontend rendering).

### Generate a New Maze

```bash
pnpm run generate  # Random seed
# or
python3 generate_maze.py 2918957128  # Specific seed
```

This runs `generate_maze.py` which:
1. **Generates** a 20×20 cell maze (41×41 grid with walls) using Recursive Backtracker algorithm
2. **Solves** the maze with BFS to verify it's solvable
3. **Exports** three files:
   - `circuit/src/maze_config.nr` - Noir circuit configuration with maze array
   - `circuit/Prover.toml` - Test witness inputs (BFS solution + padding)
   - `circuit/src/test_solutions.nr` - Noir test case with solution

### Maze Generation Algorithm

- **Algorithm**: Recursive Backtracker (DFS-based)
- **PRNG**: Park-Miller Linear Congruential Generator (MINSTD)
  - Multiplier: 48271
  - Modulus: 2^31 - 1
  - Guarantees identical output in Python and JavaScript from same seed
- **Grid Format**: Binary array where 1 = path, 0 = wall
- **Maze Size**: 20×20 cells → 41×41 grid (includes walls between cells)
- **Start/End**: Always diagonal corners: (1,1) to (39,39) in grid coordinates

### After Generating

You must recompile and test the circuit with the new maze configuration:

```bash
pnpm run nargo
```

This compiles the updated circuit, tests it with the generated solution, and copies it to the container source directory.

## API Endpoints

The production deployment exposes these API endpoints via the Cloudflare Worker:

### `GET /api/`
Returns service information and available endpoints.

**Response**:
```json
{
  "name": "Noir ZK Proof Service",
  "version": "2.0.1",
  "runtime": "Rust + Barretenberg CLI",
  "endpoints": { ... }
}
```

### `GET /api/health`
Health check that verifies container readiness and bb CLI availability.

**Response**:
```json
{
  "status": "ok",
  "bb_available": true
}
```

### `POST /api/prove`
Generates a ZK proof from witness data using the Barretenberg CLI in the container.

**Request**:
- **Content-Type**: `application/octet-stream`
- **Body**: Raw witness bytes (generated by Noir.js `execute()`)
- **Timeout**: 120 seconds (Worker) + 90 seconds (Container bb execution)

**Response**:
- **Content-Type**: `application/octet-stream`
- **Body**: Raw proof bytes (UltraHonk proof format)

**Flow**:
1. Worker receives witness and forwards to container via Durable Object
2. Container streams witness to temporary file (auto-cleanup on exit)
3. Container executes `bb prove -b /app/circuit.json -w <witness> -o -`
4. Container returns raw proof bytes to Worker
5. Worker streams proof back to client

**Error Responses**: Returns 500 with JSON error details if proof generation fails.

## Testing

### Full Circuit Validation (Recommended)

Run the complete circuit workflow with compile, execute, and test:

```bash
pnpm run nargo
```

This command:
1. Compiles the circuit from `circuit/src/main.nr`
2. Executes with witness from `circuit/Prover.toml`
3. Runs all test cases in `circuit/src/test_solutions.nr`
4. Copies outputs to `worker/container_src/`

### Individual Test Commands

If you just want to run tests without recompiling:

```bash
pnpm run test
```

This executes only the test cases defined in `circuit/src/test_solutions.nr`.

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

### Proof Generation Performance

- **Local proving** (in-browser WASM): 30-60 seconds
  - Single-threaded WebAssembly execution
  - Works offline and keeps witness completely private
  - No server costs or network dependency
  - Best for: Privacy, offline use, testing

- **Remote proving** (Cloudflare Containers): 5-10 seconds
  - Multi-core native CPU execution (4 cores)
  - Barretenberg CLI compiled for optimal performance
  - Pre-warmed CRS eliminates first-request latency
  - Scales from 1-10 container instances on demand
  - Best for: Production, user experience, lower-end devices

## Implementation Highlights

### Circuit Optimizations
- **Arithmetic-based movement**: Uses boolean arithmetic instead of branching, saving ~3,500 gates
- **Invalid move handling**: Invalid directions result in no-op moves, eliminating validation overhead
- **Underflow protection**: u8 underflow (e.g., 0-1=255) caught by bounds checking
- **Single-pass validation**: All security checks happen during move execution

### Container Optimizations
- **CRS pre-warming**: Downloads Common Reference String during build, eliminating 15s first-request delay
- **Streaming I/O**: Witness data streamed directly to file, avoiding memory buffering
- **Automatic cleanup**: Witness files deleted via RAII guard pattern
- **Native bb CLI**: Direct process execution faster than WASM/Node.js bindings

### Frontend Optimizations
- **Singleton backend**: UltraHonkBackend created once and reused across proofs
- **Hardware concurrency**: bb.js configured with `navigator.hardwareConcurrency` threads
- **Lazy loading**: Circuit JSON loaded at build time, backend initialized on mount
- **Progressive enhancement**: Local mode works without network, remote mode optional

## Troubleshooting

### Container fails to build on ARM Mac
Use `Dockerfile.dev` for local development:
```bash
cd worker
docker build -f Dockerfile.dev -t noir-container:dev .
```

### Nargo version mismatch
The installed Nargo version (beta.13) is newer than package.json (beta.9). This is expected - the Noir circuit uses the newer version while the frontend uses the older compatible noir_js library.

### Proof generation times out
- Local mode: Increase timeout or use remote mode
- Remote mode: Check container logs with `wrangler tail`
- Verify circuit compiles and tests pass: `pnpm run nargo`

### Container shows "bb: command not found"
The Barretenberg binary wasn't installed correctly during build. Rebuild the container image.

## License

See LICENSE file for details.
