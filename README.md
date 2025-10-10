# Noir Maze Challenge

A zero-knowledge proof-based maze game built with Noir, React, and Cloudflare Workers. Players navigate through a maze and generate cryptographic proofs that they completed it without revealing their solution path.

## Overview

This project combines:
- **Frontend**: React + Vite + Tailwind CSS for the interactive maze game
- **Zero-Knowledge Proofs**: Noir circuits that verify maze completion without exposing the solution
- **Backend**: Cloudflare Workers with Containers running Noir.js and bb.js for proof generation
- **Deployment**: Cloudflare Pages for static assets and Workers for serverless compute

## Architecture

- `src/` - React frontend application
- `circuit/` - Noir ZK circuit implementation
- `worker/` - Cloudflare Worker API and Container configuration
- `worker/container_src/` - Express server running inside Cloudflare Container with Noir proof generation

## Prerequisites

- Node.js 22 or higher
- pnpm (package manager)
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) (Noir toolchain)
- Python 3 (for maze generation)
- Cloudflare account (for deployment)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare's CLI tool)

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

**Note**: In development mode, proof generation runs locally in the browser. For production-grade proof generation with better performance, use the deployed version with Cloudflare Containers.

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

### Environment Configuration

The deployment is configured in `wrangler.jsonc`:
- Container uses `standard-4` instance type
- Auto-scales up to 10 instances
- 30-second timeout on proof generation requests
- Containers sleep after 1 minute of inactivity

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

The zero-knowledge circuit (`circuit/src/main.nr`) verifies that:
1. The proof is for the correct maze (validates maze seed)
2. All moves are valid (no wall collisions, within bounds)
3. The player reaches the end position
4. No more than 500 moves are used

Public inputs:
- `maze_seed` - Unique identifier for the maze configuration

Private inputs:
- `moves` - Array of directional moves (0=North, 1=East, 2=South, 3=West)

## Generating New Mazes

To generate a new maze configuration:

```bash
pnpm run generate
```

This runs `generate_maze.py` which creates a new maze and updates the circuit configuration. After generating a new maze, you must recompile the circuit:

```bash
pnpm run compile
```

## API Endpoints

The production deployment exposes these API endpoints:

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
- React 19
- Vite 7
- Tailwind CSS 4
- TypeScript

### Zero-Knowledge Proofs
- Noir 1.0.0-beta.9 (circuit language)
- bb.js 0.84.0 (proof generation)
- UltraHonk proving system

### Backend
- Cloudflare Workers (serverless runtime)
- Cloudflare Containers (containerized proof server)
- Hono (lightweight web framework)
- Express (container API server)

## Performance Notes

- In development, proof generation runs in the browser and may take 30-60 seconds
- In production, Cloudflare Containers provide multi-core CPU access for faster proof generation
- Container instances automatically scale based on demand (1-10 instances)
- Proofs are generated using the UltraHonk proving system with multi-threading support

## License

See LICENSE file for details.
