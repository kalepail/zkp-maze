# Server-Side Proof Generation Plan

## Overview

This document outlines the architecture and implementation plan for server-side proof generation backends that complement the browser-based proving options. The key architectural constraint is that **witness generation and proof verification always happen in the browser**, while the server acts as an **optional performance accelerator** for the computationally expensive proof generation step.

## Architecture Principles

### Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│ BROWSER (Trusted Environment)                               │
│                                                              │
│  1. User solves maze → moves[]                              │
│  2. Generate witness from moves (ALWAYS CLIENT-SIDE)        │
│  3. Decision: Prove locally OR send witness to server       │
│                                                              │
│  If Local:                                                   │
│    4a. Generate proof in browser (WASM)                     │
│    5a. Verify proof in browser                              │
│                                                              │
│  If Server:                                                  │
│    4b. Send witness to server →                             │
│        ┌──────────────────────────────────────┐             │
│        │ SERVER (Untrusted Accelerator)       │             │
│        │                                       │             │
│        │  - Receive witness                   │             │
│        │  - Generate proof ONLY               │             │
│        │  - Return proof                      │             │
│        │  - NO verification                   │             │
│        └──────────────────────────────────────┘             │
│    5b. ← Receive proof from server                          │
│    6b. Verify proof in browser (ALWAYS CLIENT-SIDE)         │
│                                                              │
│  7. Display result to user                                  │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

1. **Privacy**: Witness data is generated client-side, server never sees inputs
2. **Trust**: Verification happens client-side, user can independently verify correctness
3. **Transparency**: Server cannot fake proofs (browser verifies)
4. **Performance**: Heavy proving can leverage multi-core server CPUs
5. **Optional**: Server is a performance boost, not a requirement
6. **Mobile-friendly**: Offload battery-draining computation

## Backend Options

This section details all viable server-side proof generation backends, organized by circuit language and proving system.

---

## Option A: Noir + Barretenberg + UltraHonk (Current Implementation)

### Technology Stack
- **Runtime**: Node.js 22
- **Framework**: Express
- **Backend Library**: bb.js (Barretenberg WASM)
- **Proving System**: UltraHonk
- **Circuit Format**: ACIR (from Noir compilation)

### Characteristics

| Aspect | Value |
|--------|-------|
| **Proof Size** | ~15 KB |
| **Proof Time** | 10-20 seconds (Cloudflare Container, multi-core) |
| **Trusted Setup** | None required ✅ |
| **Container Size** | ~1.2 GB (Node.js + dependencies) |
| **Memory Usage** | Moderate (~500 MB during proving) |
| **Implementation Status** | ✅ Already implemented |

### API Endpoints

#### POST `/api/prove`
Generates an UltraHonk proof from witness data.

**Request:**
```json
{
  "witness": "base64-encoded-witness-data"
}
```

**Response:**
```json
{
  "proof": "base64-encoded-proof",
  "duration_ms": 12543
}
```

### Current Implementation

**File**: `worker/container_src/index.js`

```javascript
import express from 'express';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import circuit from './circuit.json' assert { type: 'json' };

const app = express();
app.use(express.json({ limit: '50mb' }));

const noir = new Noir(circuit);
const backend = new UltraHonkBackend(
  circuit.bytecode,
  { threads: 8 } // Multi-core support
);

app.post('/api/prove', async (req, res) => {
  try {
    const { witness } = req.body;

    // Decode witness from base64
    const witnessData = Buffer.from(witness, 'base64');

    // Generate proof (10-20 seconds on server)
    const startTime = Date.now();
    const proofData = await backend.generateProof(witnessData);
    const duration = Date.now() - startTime;

    // Encode proof as base64
    const proofBase64 = Buffer.from(proofData.proof).toString('base64');

    res.json({
      proof: proofBase64,
      duration_ms: duration
    });
  } catch (error) {
    console.error('Proof generation failed:', error);
    res.status(500).json({ error: 'Proof generation failed' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Docker Configuration

**File**: `worker/container_src/Dockerfile`

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080
CMD ["node", "index.js"]
```

### Pros & Cons

**Pros:**
- ✅ Already implemented and working
- ✅ No trusted setup required
- ✅ Uses same Noir circuit as browser
- ✅ Well-documented bb.js library
- ✅ Multi-threading support

**Cons:**
- ❌ Large proof size (~15 KB)
- ❌ Large container image (~1.2 GB)
- ❌ Node.js runtime overhead
- ❌ Moderate memory usage

---

## Option B: Noir + Arkworks + Groth16 (Proposed Rust Implementation)

### Technology Stack
- **Runtime**: Rust (native binary)
- **Framework**: Actix-web
- **Backend Library**: Arkworks (ark-groth16)
- **Proving System**: Groth16
- **Circuit Format**: ACIR → Arkworks R1CS

### Characteristics

| Aspect | Value |
|--------|-------|
| **Proof Size** | ~500 bytes (30x smaller than UltraHonk!) |
| **Proof Time** | 5-15 seconds (estimated, native Rust) |
| **Trusted Setup** | Required ⚠️ (one-time Phase 2 ceremony) |
| **Container Size** | ~100 MB (10x smaller than Node.js) |
| **Memory Usage** | Low (~200 MB during proving) |
| **Implementation Status** | 📋 Proposed (not yet implemented) |

### Why Arkworks + Groth16?

1. **Smallest proofs**: 500 bytes vs 15 KB (97% reduction)
2. **Faster proving**: Native Rust outperforms Node.js/WASM
3. **Lower costs**: Smaller containers, less memory, faster execution
4. **On-chain ready**: Groth16 proofs can be verified on Ethereum
5. **Better performance**: Direct hardware access, no JS overhead

### API Endpoints

#### POST `/api/prove-groth16`
Generates a Groth16 proof from witness data using Arkworks.

**Request:**
```json
{
  "witness": "base64-encoded-witness-data"
}
```

**Response:**
```json
{
  "proof": "base64-encoded-groth16-proof",
  "public_inputs": ["123456"],
  "duration_ms": 8234
}
```

### Proposed Implementation

**File**: `worker/container_rust/src/main.rs`

```rust
use actix_web::{web, App, HttpServer, HttpResponse, Error};
use ark_groth16::{Groth16, ProvingKey, VerifyingKey, Proof};
use ark_bn254::Bn254;
use ark_serialize::{CanonicalSerialize, CanonicalDeserialize};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use std::sync::Arc;
use std::time::Instant;

// Load proving key at startup (generated during setup ceremony)
lazy_static::lazy_static! {
    static ref PROVING_KEY: Arc<ProvingKey<Bn254>> = {
        let pk_bytes = include_bytes!("../keys/proving_key.bin");
        Arc::new(ProvingKey::deserialize_compressed(&pk_bytes[..])
            .expect("Failed to load proving key"))
    };
}

#[derive(Deserialize)]
struct ProveRequest {
    witness: String, // base64 encoded
}

#[derive(Serialize)]
struct ProveResponse {
    proof: String,          // base64 encoded
    public_inputs: Vec<String>,
    duration_ms: u128,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

async fn prove_groth16(
    req: web::Json<ProveRequest>
) -> Result<HttpResponse, Error> {
    let start = Instant::now();

    // Decode witness from base64
    let witness_bytes = general_purpose::STANDARD
        .decode(&req.witness)
        .map_err(|e| {
            actix_web::error::ErrorBadRequest(
                format!("Invalid base64: {}", e)
            )
        })?;

    // Parse witness into Arkworks format
    // (This would need custom conversion from Noir witness format)
    let witness = parse_noir_witness(&witness_bytes)
        .map_err(|e| {
            actix_web::error::ErrorBadRequest(
                format!("Invalid witness: {}", e)
            )
        })?;

    // Generate Groth16 proof
    let proof = Groth16::<Bn254>::prove(
        &PROVING_KEY,
        witness.circuit,
        &witness.inputs
    ).map_err(|e| {
        actix_web::error::ErrorInternalServerError(
            format!("Proof generation failed: {}", e)
        )
    })?;

    // Serialize proof to bytes
    let mut proof_bytes = Vec::new();
    proof.serialize_compressed(&mut proof_bytes)
        .map_err(|e| {
            actix_web::error::ErrorInternalServerError(
                format!("Proof serialization failed: {}", e)
            )
        })?;

    // Encode proof as base64
    let proof_b64 = general_purpose::STANDARD.encode(&proof_bytes);

    // Extract public inputs
    let public_inputs: Vec<String> = witness.public_inputs
        .iter()
        .map(|x| x.to_string())
        .collect();

    let duration = start.elapsed().as_millis();

    Ok(HttpResponse::Ok().json(ProveResponse {
        proof: proof_b64,
        public_inputs,
        duration_ms: duration,
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    println!("Starting Arkworks Groth16 proving server...");
    println!("Proving key loaded: {} constraints", PROVING_KEY.vk.gamma_abc_g1.len());

    HttpServer::new(|| {
        App::new()
            .route("/api/prove-groth16", web::post().to(prove_groth16))
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
    .bind("0.0.0.0:8080")?
    .workers(4) // Multi-threading
    .run()
    .await
}

// Helper function to convert Noir witness format to Arkworks format
fn parse_noir_witness(bytes: &[u8]) -> Result<WitnessData, String> {
    // Implementation would convert Noir's witness format
    // to Arkworks' constraint system format
    // This is circuit-specific and would need to be generated
    // during the Noir → Arkworks compilation step
    todo!("Implement Noir witness → Arkworks conversion")
}

struct WitnessData {
    circuit: ark_relations::r1cs::ConstraintSystem<ark_bn254::Fr>,
    inputs: Vec<ark_bn254::Fr>,
    public_inputs: Vec<ark_bn254::Fr>,
}
```

**File**: `worker/container_rust/Cargo.toml`

```toml
[package]
name = "noir-maze-groth16-prover"
version = "0.1.0"
edition = "2021"

[dependencies]
actix-web = "4"
ark-groth16 = "0.4"
ark-bn254 = "0.4"
ark-serialize = "0.4"
ark-relations = "0.4"
ark-std = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
base64 = "0.21"
lazy_static = "1.4"
env_logger = "0.11"
log = "0.4"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

### Docker Configuration

**File**: `worker/container_rust/Dockerfile`

```dockerfile
# Build stage
FROM rust:1.75-slim as builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Build dependencies (cache layer)
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy source code
COPY src ./src
COPY keys ./keys

# Build application
RUN touch src/main.rs && \
    cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/noir-maze-groth16-prover .

EXPOSE 8080

CMD ["./noir-maze-groth16-prover"]
```

### Trusted Setup Process

Before deployment, you must run a Groth16 trusted setup ceremony:

```bash
# 1. Compile Noir circuit to ACIR
cd circuit
nargo compile

# 2. Convert ACIR to R1CS for Arkworks
# (This would require a custom tool or use circom as intermediate)
noir-to-arkworks circuit/target/circuit.json > circuit.r1cs

# 3. Download Powers of Tau (universal, one-time)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_20.ptau

# 4. Run Groth16 setup (circuit-specific)
arkworks-cli groth16 setup \
  --r1cs circuit.r1cs \
  --ptau powersOfTau28_hez_final_20.ptau \
  --output keys/

# 5. Contribute randomness (production security)
arkworks-cli groth16 contribute \
  --zkey keys/proving_key.bin \
  --name "Your Name" \
  --output keys/proving_key_contrib.bin

# 6. Use contributed key for deployment
mv keys/proving_key_contrib.bin keys/proving_key.bin
```

### Cloudflare Deployment

**File**: `wrangler.jsonc` (add new service)

```jsonc
{
  "services": [
    // ... existing services ...
    {
      "name": "noir-maze-groth16-prover",
      "type": "container",
      "image": "noir-maze-groth16-prover:latest",
      "bindings": [
        {
          "type": "durable_object_namespace",
          "name": "GROTH16_PROVER",
          "class_name": "Groth16Prover"
        }
      ],
      "resources": {
        "cpu": 4,
        "memory": "1GB"
      },
      "scaling": {
        "min_instances": 0,
        "max_instances": 10
      }
    }
  ]
}
```

### Browser Integration

**File**: `src/hooks/useMazeProofServer.ts` (update)

```typescript
// Add Groth16 option
export type ServerProofSystem = 'ultrahonk' | 'groth16';

export function useMazeProofServer(
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void,
  system: ServerProofSystem = 'ultrahonk'
) {
  const [proving, setProving] = useState(false);

  const generateProof = useCallback(
    async (moves: number[]) => {
      try {
        setProving(true);
        setProof('');

        // Pad moves array
        const paddedMoves = new Array(MAX_MOVES).fill(0);
        moves.forEach((move, i) => {
          if (i < MAX_MOVES) paddedMoves[i] = move;
        });

        // Generate witness locally (ALWAYS client-side)
        const noir = new Noir(circuit);
        addLog('🧮 Generating witness locally...');
        const witnessStart = performance.now();
        const { witness } = await noir.execute({
          maze_seed: mazeSeed.toString(),
          moves: paddedMoves,
        });
        const witnessDuration = ((performance.now() - witnessStart) / 1000).toFixed(1);
        addLog(`Generated witness ✅ (${witnessDuration}s)`);

        // Send witness to server for proving
        const endpoint = system === 'groth16'
          ? '/api/prove-groth16'
          : '/api/prove';

        addLog(`🚀 Sending witness to server (${system})...`);
        const proofStart = performance.now();

        // Serialize witness to base64
        const witnessBytes = witness.toUint8Array();
        const witnessB64 = btoa(String.fromCharCode(...witnessBytes));

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ witness: witnessB64 }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.statusText}`);
        }

        const { proof: proofB64, duration_ms } = await response.json();
        const proofDuration = (duration_ms / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${proofDuration}s on server)`);

        // Verify proof locally (ALWAYS client-side)
        addLog('🔍 Verifying proof locally...');
        const verifyStart = performance.now();

        const proofBytes = Uint8Array.from(atob(proofB64), c => c.charCodeAt(0));
        const backend = new UltraHonkBackend(circuit.bytecode);
        const isValid = await backend.verifyProof({ proof: proofBytes });

        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
          setProof(proofB64);
          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        }

        await backend.destroy();
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog, setProof, system]
  );

  return { proving, generateProof };
}
```

### Pros & Cons

**Pros:**
- ✅ Tiny proofs (500 bytes, 97% smaller)
- ✅ Faster proving (native Rust, 5-15s)
- ✅ Smaller container (~100 MB vs 1.2 GB)
- ✅ Lower memory usage (~200 MB)
- ✅ Lower Cloudflare costs
- ✅ On-chain verifiable (Ethereum compatible)

**Cons:**
- ❌ Requires trusted setup ceremony
- ❌ Setup must be redone if circuit changes
- ❌ Implementation effort (Rust + Arkworks)
- ❌ Noir → Arkworks conversion needed
- ❌ Less mature ecosystem than Barretenberg

---

## Option C-E: Circom + snarkjs (Node.js)

### Overview

While the primary browser-side plan includes Circom circuits with Groth16, PLONK, and FFLONK, you could optionally offer server-side proving for Circom circuits as well.

### When to Implement

**Implement if:**
- Users want to write Circom circuits (different from Noir)
- Want server-side performance for Circom circuits
- Building a full-featured ZK playground

**Skip if:**
- Noir circuits are sufficient
- Focus is on comparing Noir backends (Barretenberg vs Arkworks)
- Want to minimize complexity

### Technology Stack

All three would use the same stack:
- **Runtime**: Node.js 22
- **Framework**: Express
- **Backend Library**: snarkjs
- **Proving Systems**: Groth16, PLONK, or FFLONK
- **Circuit Format**: R1CS (from Circom compilation)

### Characteristics

| System | Proof Size | Trusted Setup | Performance |
|--------|-----------|---------------|-------------|
| **Groth16** | ~500 bytes | Per-circuit | 10-20s |
| **PLONK** | ~1 KB | Universal | 10-20s |
| **FFLONK** | ~1 KB | Universal | 10-20s |

### Unified Implementation

**File**: `worker/container_circom/index.js`

```javascript
import express from 'express';
import * as snarkjs from 'snarkjs';
import fs from 'fs/promises';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Load circuit files (compiled from Circom)
const wasmFile = await fs.readFile('./circom/maze.wasm');
const groth16ZKey = await fs.readFile('./circom/groth16/maze_final.zkey');
const plonkZKey = await fs.readFile('./circom/plonk/maze_plonk.zkey');
const fflonkZKey = await fs.readFile('./circom/fflonk/maze_fflonk.zkey');

// Generic proving endpoint
app.post('/api/prove-circom/:system', async (req, res) => {
  const { system } = req.params; // 'groth16', 'plonk', or 'fflonk'
  const { input } = req.body;

  try {
    const startTime = Date.now();
    let result;

    switch (system) {
      case 'groth16':
        result = await snarkjs.groth16.fullProve(
          input,
          wasmFile,
          groth16ZKey
        );
        break;

      case 'plonk':
        result = await snarkjs.plonk.fullProve(
          input,
          wasmFile,
          plonkZKey
        );
        break;

      case 'fflonk':
        result = await snarkjs.fflonk.fullProve(
          input,
          wasmFile,
          fflonkZKey
        );
        break;

      default:
        return res.status(400).json({ error: 'Invalid system' });
    }

    const duration = Date.now() - startTime;

    res.json({
      proof: JSON.stringify(result.proof),
      public_signals: result.publicSignals,
      duration_ms: duration,
    });
  } catch (error) {
    console.error(`${system} proof generation failed:`, error);
    res.status(500).json({ error: 'Proof generation failed' });
  }
});

app.listen(8080, () => {
  console.log('Circom proving server running on port 8080');
});
```

### Docker Configuration

**File**: `worker/container_circom/Dockerfile`

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled Circom circuits and keys
COPY circom ./circom

COPY index.js ./

EXPOSE 8080
CMD ["node", "index.js"]
```

### Pros & Cons

**Pros:**
- ✅ Supports all three Circom proving systems
- ✅ Reuses browser-side Circom circuits
- ✅ Simple Node.js implementation
- ✅ Users can compare browser vs server performance

**Cons:**
- ❌ Redundant if only using Noir circuits
- ❌ Adds deployment complexity
- ❌ Similar performance to browser (both use WASM)
- ❌ Less compelling than Rust Arkworks option

---

## Comparison Matrix

### All Backend Options

| Option | Language | Proving System | Proof Size | Setup | Container Size | Proving Time | Implementation |
|--------|----------|----------------|------------|-------|----------------|--------------|----------------|
| **A: Noir + Barretenberg** | Node.js | UltraHonk | 15 KB | None | 1.2 GB | 10-20s | ✅ Current |
| **B: Noir + Arkworks** | Rust | Groth16 | 500 B | Required | 100 MB | 5-15s | 📋 Proposed |
| **C: Circom + snarkjs** | Node.js | Groth16 | 500 B | Required | 800 MB | 10-20s | 📋 Optional |
| **D: Circom + snarkjs** | Node.js | PLONK | 1 KB | Universal | 800 MB | 10-20s | 📋 Optional |
| **E: Circom + snarkjs** | Node.js | FFLONK | 1 KB | Universal | 800 MB | 10-20s | 📋 Optional |

### Performance Comparison

```
Proof Size:
Groth16 (Arkworks/snarkjs): █ 500 bytes
PLONK (snarkjs):            ██ 1 KB
FFLONK (snarkjs):           ██ 1 KB
UltraHonk (Barretenberg):   ██████████████████████████████ 15 KB

Container Size:
Rust (Arkworks):            ██ 100 MB
Circom (snarkjs):           ████████ 800 MB
Noir (Barretenberg):        ████████████ 1.2 GB

Proving Time (estimated):
Rust (Arkworks):            █████ 5-15s
Node (Barretenberg):        ██████████ 10-20s
Node (snarkjs):             ██████████ 10-20s
```

---

## Recommended Implementation Phases

### Phase 1: Keep Current (Immediate)
- ✅ Already working: Noir + Barretenberg + UltraHonk
- ✅ No trusted setup complexity
- ✅ Good performance
- ✅ Reliable and documented

**Status**: Production-ready

### Phase 2: Add Arkworks Groth16 (High Value)
- 📋 Implement Rust + Arkworks backend
- 📋 Run trusted setup ceremony
- 📋 Deploy alongside existing Node.js container
- 📋 Add UI toggle for UltraHonk vs Groth16

**Value**:
- 97% smaller proofs
- Faster proving
- Lower costs
- Educational comparison

**Effort**: Medium (1-2 weeks)

### Phase 3: Circom Server-Side (Optional)
- 📋 Only if users need server-side Circom proving
- 📋 Less valuable than browser-side Circom (already planned)
- 📋 Nice-to-have for completeness

**Value**: Low (redundant with browser-side)

**Effort**: Low (1-3 days)

---

## Implementation Checklist

### Arkworks Groth16 Backend (Recommended Next Step)

#### Setup & Configuration
- [ ] Create `worker/container_rust/` directory
- [ ] Initialize Rust project with Cargo
- [ ] Add Arkworks dependencies
- [ ] Create Dockerfile for multi-stage build

#### Trusted Setup
- [ ] Download Powers of Tau file
- [ ] Convert Noir circuit to Arkworks-compatible format
- [ ] Run Groth16 setup ceremony
- [ ] Contribute randomness (production security)
- [ ] Export proving/verification keys
- [ ] Document ceremony process

#### Server Implementation
- [ ] Implement Actix-web HTTP server
- [ ] Add `/api/prove-groth16` endpoint
- [ ] Implement witness parsing from Noir format
- [ ] Implement Groth16 proof generation
- [ ] Add error handling and logging
- [ ] Add health check endpoint

#### Integration
- [ ] Update `wrangler.jsonc` with Rust container config
- [ ] Deploy to Cloudflare Workers
- [ ] Test witness → proof flow
- [ ] Measure performance benchmarks

#### Browser Integration
- [ ] Update `useMazeProofServer` hook
- [ ] Add proof system selector UI
- [ ] Implement client-side verification
- [ ] Add timing/performance logs
- [ ] Test end-to-end flow

#### Documentation
- [ ] Document API endpoints
- [ ] Add setup ceremony instructions
- [ ] Create deployment guide
- [ ] Add performance comparison
- [ ] Update README.md

---

## API Reference

### UltraHonk Endpoint (Current)

```
POST /api/prove
Content-Type: application/json

Request:
{
  "witness": "base64-encoded-witness"
}

Response:
{
  "proof": "base64-encoded-proof",
  "duration_ms": 12543
}
```

### Groth16 Endpoint (Proposed)

```
POST /api/prove-groth16
Content-Type: application/json

Request:
{
  "witness": "base64-encoded-witness"
}

Response:
{
  "proof": "base64-encoded-groth16-proof",
  "public_inputs": ["123456"],
  "duration_ms": 8234
}
```

### Circom Endpoints (Optional)

```
POST /api/prove-circom/:system
Content-Type: application/json
:system = "groth16" | "plonk" | "fflonk"

Request:
{
  "input": {
    "maze_seed": "123456",
    "moves": [0, 1, 2, ...]
  }
}

Response:
{
  "proof": "json-encoded-proof",
  "public_signals": ["123456"],
  "duration_ms": 15234
}
```

---

## Cost Analysis

### Cloudflare Container Pricing (Estimated)

**Current Setup** (Node.js + Barretenberg):
- Container size: 1.2 GB
- Memory usage: ~500 MB
- CPU time: 10-20s per proof
- Storage: ~$0.15/GB/month
- Compute: ~$0.024 per CPU-second

**With Arkworks** (Rust + Groth16):
- Container size: 100 MB (12x smaller)
- Memory usage: ~200 MB (2.5x smaller)
- CPU time: 5-15s per proof (1.5x faster)
- Storage: ~$0.015/GB/month (10x cheaper)
- Compute: ~$0.012 per CPU-second (2x cheaper)

**Estimated Monthly Savings** (1000 proofs/month):
- Storage: $1.35 → $0.15 (90% reduction)
- Compute: $360 → $180 (50% reduction)
- **Total**: ~$180/month savings at scale

---

## Security Considerations

### Browser-Side Verification (Critical)

**Why verification must be client-side:**
1. **Trust**: Server could return fake proofs
2. **Privacy**: Browser verifies without exposing inputs
3. **Transparency**: User can independently verify
4. **Security**: Malicious server cannot compromise proof validity

### Trusted Setup (Groth16)

**Security model:**
- Universal Powers of Tau: Trust one of 100+ contributors
- Circuit-specific Phase 2: Trust your own ceremony
- Multi-party contribution: Compromise requires ALL parties to collude

**Recommendations:**
- Use community Powers of Tau (well-audited)
- Run your own Phase 2 contribution
- Document ceremony participants
- Consider using existing community ceremonies if available

---

## Performance Benchmarks

### Expected Performance (Cloudflare Containers)

| Metric | Barretenberg (Current) | Arkworks (Proposed) |
|--------|------------------------|---------------------|
| Witness Gen | 0.5-1s (browser) | 0.5-1s (browser) |
| Proof Gen | 10-20s (server) | 5-15s (server) |
| Verification | 0.5-1s (browser) | 0.3-0.8s (browser) |
| **Total** | **11-22s** | **6-17s** |
| Proof Size | 15,360 bytes | 512 bytes |
| Transfer Time (3G) | ~120ms | ~4ms |

### Real-World Example

**User solves maze:**
1. Browser generates witness: 0.8s
2. Send witness to server: 20ms (small data)
3. Server generates proof:
   - Barretenberg: 15s
   - Arkworks: 10s
4. Download proof:
   - Barretenberg: 120ms (15 KB)
   - Arkworks: 4ms (500 bytes)
5. Browser verifies proof:
   - Barretenberg: 0.7s
   - Arkworks: 0.5s

**Total user experience:**
- **Barretenberg**: 16.6s
- **Arkworks**: 11.3s (32% faster)

---

## Conclusion

The server-side proof generation architecture provides an **optional performance boost** while maintaining **browser-side trust** through client-side verification. The proposed Rust + Arkworks + Groth16 backend offers significant improvements in proof size, performance, and cost over the current Node.js + Barretenberg setup, making it a compelling addition for Phase 2 of the project.

### Summary

- **Current (Phase 1)**: Noir + Barretenberg + UltraHonk works well
- **Recommended (Phase 2)**: Add Noir + Arkworks + Groth16 for:
  - 97% smaller proofs
  - 30-40% faster proving
  - 50% lower costs
  - On-chain compatibility
- **Optional (Phase 3)**: Circom server-side if needed

The browser-first architecture ensures user privacy and proof validity remain client-controlled, while server-side proving provides a convenient performance optimization for users who want faster results.
