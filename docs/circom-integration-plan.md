# Circom Integration Plan: Multi-System Proof Comparison

## Executive Summary

Add three Circom-based proof systems (Groth16, PLONK, FFLONK) as browser-only alternatives to the existing Noir/UltraHonk implementation, allowing users to compare different zero-knowledge proof systems in the same application.

## Overview: Four Proof System Options

Users will be able to select between:

1. **Noir + UltraHonk** (existing) - No setup required, medium proof size
2. **Circom + Groth16** (new) - Complex setup, tiny proof, fastest verification
3. **Circom + PLONK** (new) - Universal setup, small proof, fast verification
4. **Circom + FFLONK** (new) - Universal setup, small proof, very fast verification

All systems run entirely in the browser with lazy loading to optimize bundle size.

## System Comparison

| Aspect | Noir/UltraHonk | Circom/Groth16 | Circom/PLONK | Circom/FFLONK |
|--------|---------------|----------------|--------------|---------------|
| **Circuit Language** | Noir (high-level) | Circom (low-level) | Circom | Circom |
| **Backend** | Barretenberg (bb.js) | snarkjs | snarkjs | snarkjs |
| **Trusted Setup** | None ✅ | Per-circuit ❌ | Universal ✅ | Universal ✅ |
| **Proof Size** | ~15KB | ~500 bytes ⚡ | ~1KB | ~1-1.5KB |
| **Verification Time** | ~200ms | ~50ms ⚡ | ~120ms | ~70ms ⚡ |
| **Download Size** | ~3MB | ~25MB | ~18MB | ~18MB |
| **Circuit Flexibility** | Easy recompile | Redo ceremony | Re-run setup | Re-run setup |
| **Maturity** | Newer | Production | Production | Beta |
| **On-chain Gas** | 380K | 230K ⚡ | 280K | 240K |

## Architecture Details

### Current: Noir + UltraHonk

**Files:**
- `circuit.json` (1MB ACIR bytecode)
- bb.js WASM (~2MB, auto-loaded)
- No setup files needed

**Workflow:**
```typescript
const noir = new Noir(circuit);
const backend = new UltraHonkBackend(circuit.bytecode);
const { witness } = await noir.execute(inputs);      // 0.5-2s
const proofData = await backend.generateProof(witness); // 25-50s
const isValid = await backend.verifyProof(proofData);   // 0.2-0.5s
```

### New: Circom Systems (All Three)

**Files per system:**
- `maze.wasm` (2-5MB) - Witness calculator (can be shared!)
- `maze_final.zkey` (10-30MB) - Proving key
- `verification_key.json` (2KB) - Verification key

**Workflow (identical API for all three):**
```typescript
// Just change: groth16 | plonk | fflonk
const { proof, publicSignals } = await groth16.fullProve(
  inputs,
  '/circom/groth16/maze.wasm',
  '/circom/groth16/maze_final.zkey'
);
// Witness + proof generation combined: 15-40s

const vkey = await fetch('/circom/groth16/verification_key.json').then(r => r.json());
const isValid = await groth16.verify(vkey, publicSignals, proof); // 0.05-0.15s
```

## Why Each System?

### Noir + UltraHonk
**When to use:** Default choice
- No setup hassle
- Instant start (small download)
- Easy to modify circuit

### Circom + Groth16
**When to use:** Need smallest possible proofs
- On-chain verification priority
- Proof size matters most
- Can tolerate setup ceremony
- Circuit unlikely to change

### Circom + PLONK
**When to use:** Balance of ease and performance
- Want smaller proofs than UltraHonk
- Circuit may change frequently
- Don't want per-circuit ceremonies
- Production-ready system

### Circom + FFLONK
**When to use:** Best of PLONK + Groth16
- Want fast verification like Groth16
- Want universal setup like PLONK
- Can tolerate beta software
- Similar proof size to PLONK

## Implementation Plan

### Phase 1: Circuit Development (Week 1-2)

#### 1.1 Directory Structure

```
circuit-circom/
├── circuits/
│   ├── maze.circom              # Main circuit
│   ├── utils/
│   │   ├── comparators.circom   # IsEqual, LessThan from circomlib
│   │   ├── selectors.circom     # QuinSelector for array indexing
│   │   └── gates.circom         # AND, OR, NOT helpers
│   └── maze_config.circom       # Auto-generated from maze_seed.json
├── input.json                   # Example input for testing
├── test/
│   └── maze.test.js             # Circuit tests
├── build/                       # Compilation outputs (gitignored)
│   ├── maze.r1cs
│   ├── maze.wasm
│   ├── maze.sym
│   ├── groth16/
│   │   ├── maze_0000.zkey
│   │   ├── maze_final.zkey
│   │   └── verification_key.json
│   ├── plonk/
│   │   ├── maze_final.zkey
│   │   └── verification_key.json
│   └── fflonk/
│       ├── maze_final.zkey
│       └── verification_key.json
├── ptau/                        # Powers of Tau files
│   └── powersOfTau28_hez_final_20.ptau (150MB)
└── package.json
```

#### 1.2 Circom Circuit Implementation

**Main Challenge:** Circom doesn't support dynamic array indexing with signals

**Solution:** Use QuinSelector/Multiplexer pattern

```circom
pragma circom 2.0.0;

include "circomlib/comparators.circom";
include "circomlib/gates.circom";

template MazeVerifier() {
    // Constants (from maze_config.circom)
    var MAZE_SIZE = 41;
    var MAX_MOVES = 500;
    var START_ROW = 1;
    var START_COL = 1;
    var END_ROW = 39;
    var END_COL = 39;
    var MAZE_SEED = 2918957128;

    // Public input
    signal input maze_seed;

    // Private inputs
    signal input moves[MAX_MOVES];
    signal input maze[MAZE_SIZE][MAZE_SIZE];

    // Verify correct maze
    maze_seed === MAZE_SEED;

    // Track position with signals
    signal row[MAX_MOVES + 1];
    signal col[MAX_MOVES + 1];

    // Initialize
    row[0] <== START_ROW;
    col[0] <== START_COL;

    // Track if we've reached the end
    signal reached[MAX_MOVES + 1];
    reached[0] <== 0;

    component moveProcessors[MAX_MOVES];

    for (var i = 0; i < MAX_MOVES; i++) {
        // Process move
        moveProcessors[i] = ProcessMove(MAZE_SIZE);
        moveProcessors[i].curr_row <== row[i];
        moveProcessors[i].curr_col <== col[i];
        moveProcessors[i].direction <== moves[i];
        moveProcessors[i].maze_flat <== /* flatten maze array */;
        moveProcessors[i].reached <== reached[i];

        row[i + 1] <== moveProcessors[i].next_row;
        col[i + 1] <== moveProcessors[i].next_col;

        // Check if we reached end
        signal at_end_row <== IsEqual()([row[i + 1], END_ROW]);
        signal at_end_col <== IsEqual()([col[i + 1], END_COL]);
        signal at_end <== AND()(at_end_row, at_end_col);
        reached[i + 1] <== OR()(reached[i], at_end);
    }

    // Must reach end
    reached[MAX_MOVES] === 1;
}

template ProcessMove(MAZE_SIZE) {
    signal input curr_row;
    signal input curr_col;
    signal input direction;
    signal input maze_flat[MAZE_SIZE * MAZE_SIZE];
    signal input reached;

    signal output next_row;
    signal output next_col;

    // Direction checks
    component is_north = IsEqual();
    is_north.in[0] <== direction;
    is_north.in[1] <== 0;

    component is_east = IsEqual();
    is_east.in[0] <== direction;
    is_east.in[1] <== 1;

    component is_south = IsEqual();
    is_south.in[0] <== direction;
    is_south.in[1] <== 2;

    component is_west = IsEqual();
    is_west.in[0] <== direction;
    is_west.in[1] <== 3;

    // Calculate deltas
    signal row_delta <== is_south.out - is_north.out;
    signal col_delta <== is_east.out - is_west.out;

    // New position (only if not already reached)
    signal tentative_row <== curr_row + row_delta;
    signal tentative_col <== curr_col + col_delta;

    // If already reached, don't move
    next_row <== curr_row + row_delta * (1 - reached);
    next_col <== curr_col + col_delta * (1 - reached);

    // Bounds check
    component row_lt = LessThan(8);
    row_lt.in[0] <== next_row;
    row_lt.in[1] <== MAZE_SIZE;
    row_lt.out === 1;

    component col_lt = LessThan(8);
    col_lt.in[0] <== next_col;
    col_lt.in[1] <== MAZE_SIZE;
    col_lt.out === 1;

    // Maze lookup (requires QuinSelector for large arrays)
    signal index <== next_row * MAZE_SIZE + next_col;
    component cell_selector = QuinSelector(MAZE_SIZE * MAZE_SIZE);
    for (var i = 0; i < MAZE_SIZE * MAZE_SIZE; i++) {
        cell_selector.in[i] <== maze_flat[i];
    }
    cell_selector.index <== index;
    cell_selector.out === 1;  // Must be path cell
}

component main {public [maze_seed]} = MazeVerifier();
```

**Note on QuinSelector:** For 41×41 maze = 1681 cells, this will generate ~1681 constraints per move. Total: ~840K constraints for 500 moves. This is manageable with 2^20 Powers of Tau.

#### 1.3 Maze Configuration Generator

Create `scripts/generate-circom-maze.js`:

```javascript
import fs from 'fs';
import path from 'path';

function generateCircomConfig() {
  const mazeConfig = JSON.parse(
    fs.readFileSync('./src/maze_seed.json', 'utf8')
  );

  let circomCode = `pragma circom 2.0.0;\n\n`;
  circomCode += `// Auto-generated from maze_seed.json\n`;
  circomCode += `// DO NOT EDIT MANUALLY\n\n`;

  circomCode += `function getMazeFlat() {\n`;
  circomCode += `    var maze[${mazeConfig.rows * mazeConfig.cols}] = [\n`;

  // Flatten maze array
  const flatMaze = [];
  for (let row = 0; row < mazeConfig.rows; row++) {
    for (let col = 0; col < mazeConfig.cols; col++) {
      flatMaze.push(mazeConfig.maze[row][col]);
    }
  }

  // Output in groups of 20
  for (let i = 0; i < flatMaze.length; i += 20) {
    const chunk = flatMaze.slice(i, i + 20);
    circomCode += `        ${chunk.join(', ')}${i + 20 < flatMaze.length ? ',' : ''}\n`;
  }

  circomCode += `    ];\n`;
  circomCode += `    return maze;\n`;
  circomCode += `}\n`;

  fs.writeFileSync(
    './circuit-circom/circuits/maze_config.circom',
    circomCode
  );

  console.log('✅ Generated maze_config.circom');
}

generateCircomConfig();
```

### Phase 2: Trusted Setup (Week 2)

#### 2.1 Download Powers of Tau

```bash
mkdir -p circuit-circom/ptau
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_20.ptau \
  -O circuit-circom/ptau/powersOfTau28_hez_final_20.ptau
```

**Note:** 2^20 supports up to ~1 million constraints, sufficient for our circuit.

#### 2.2 Setup Script for All Three Systems

Create `scripts/setup-circom.js`:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

async function setupAll() {
  console.log('🔐 Setting up all Circom proof systems...\n');

  const ptauFile = 'circuit-circom/ptau/powersOfTau28_hez_final_20.ptau';
  const r1csFile = 'circuit-circom/build/maze.r1cs';

  // Check files exist
  if (!fs.existsSync(ptauFile)) {
    console.error('❌ Powers of Tau file not found. Run download script first.');
    process.exit(1);
  }

  if (!fs.existsSync(r1csFile)) {
    console.error('❌ R1CS file not found. Compile circuit first.');
    process.exit(1);
  }

  // === GROTH16 SETUP ===
  console.log('📦 Setting up Groth16...');

  // Initial setup
  await execAsync(
    `snarkjs groth16 setup ${r1csFile} ${ptauFile} ` +
    `circuit-circom/build/groth16/maze_0000.zkey`
  );

  // Contribute randomness
  console.log('🎲 Contributing randomness to Groth16...');
  const randomness = Math.random().toString();
  await execAsync(
    `snarkjs zkey contribute ` +
    `circuit-circom/build/groth16/maze_0000.zkey ` +
    `circuit-circom/build/groth16/maze_final.zkey ` +
    `--name="Maze Challenge Contribution" -e="${randomness}"`
  );

  // Export verification key
  await execAsync(
    `snarkjs zkey export verificationkey ` +
    `circuit-circom/build/groth16/maze_final.zkey ` +
    `circuit-circom/build/groth16/verification_key.json`
  );

  console.log('✅ Groth16 setup complete\n');

  // === PLONK SETUP ===
  console.log('📦 Setting up PLONK...');

  await execAsync(
    `snarkjs plonk setup ${r1csFile} ${ptauFile} ` +
    `circuit-circom/build/plonk/maze_final.zkey`
  );

  await execAsync(
    `snarkjs zkey export verificationkey ` +
    `circuit-circom/build/plonk/maze_final.zkey ` +
    `circuit-circom/build/plonk/verification_key.json`
  );

  console.log('✅ PLONK setup complete\n');

  // === FFLONK SETUP ===
  console.log('📦 Setting up FFLONK...');

  await execAsync(
    `snarkjs fflonk setup ${r1csFile} ${ptauFile} ` +
    `circuit-circom/build/fflonk/maze_final.zkey`
  );

  await execAsync(
    `snarkjs zkey export verificationkey ` +
    `circuit-circom/build/fflonk/maze_final.zkey ` +
    `circuit-circom/build/fflonk/verification_key.json`
  );

  console.log('✅ FFLONK setup complete\n');

  // Copy artifacts to public directory
  console.log('📋 Copying artifacts to public directory...');

  // Create directories
  fs.mkdirSync('public/circom/groth16', { recursive: true });
  fs.mkdirSync('public/circom/plonk', { recursive: true });
  fs.mkdirSync('public/circom/fflonk', { recursive: true });

  // Copy wasm (same for all three)
  fs.copyFileSync(
    'circuit-circom/build/maze_js/maze.wasm',
    'public/circom/groth16/maze.wasm'
  );

  // Symlink for others (or copy if on Windows)
  try {
    fs.symlinkSync(
      '../groth16/maze.wasm',
      'public/circom/plonk/maze.wasm'
    );
    fs.symlinkSync(
      '../groth16/maze.wasm',
      'public/circom/fflonk/maze.wasm'
    );
  } catch {
    // Fallback to copy on Windows
    fs.copyFileSync(
      'public/circom/groth16/maze.wasm',
      'public/circom/plonk/maze.wasm'
    );
    fs.copyFileSync(
      'public/circom/groth16/maze.wasm',
      'public/circom/fflonk/maze.wasm'
    );
  }

  // Copy zkeys and vkeys
  for (const system of ['groth16', 'plonk', 'fflonk']) {
    fs.copyFileSync(
      `circuit-circom/build/${system}/maze_final.zkey`,
      `public/circom/${system}/maze_final.zkey`
    );
    fs.copyFileSync(
      `circuit-circom/build/${system}/verification_key.json`,
      `public/circom/${system}/verification_key.json`
    );
  }

  console.log('✅ All artifacts copied\n');

  // Display file sizes
  console.log('📦 File sizes:');
  const wasm = fs.statSync('public/circom/groth16/maze.wasm');
  const groth16Zkey = fs.statSync('public/circom/groth16/maze_final.zkey');
  const plonkZkey = fs.statSync('public/circom/plonk/maze_final.zkey');
  const fflonkZkey = fs.statSync('public/circom/fflonk/maze_final.zkey');

  console.log(`   WASM: ${(wasm.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Groth16 zkey: ${(groth16Zkey.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   PLONK zkey: ${(plonkZkey.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   FFLONK zkey: ${(fflonkZkey.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Total: ${((wasm.size + groth16Zkey.size + plonkZkey.size + fflonkZkey.size) / 1024 / 1024).toFixed(2)} MB`);
}

setupAll().catch(console.error);
```

### Phase 3: Browser Integration (Week 3-4)

#### 3.1 Install Dependencies

```bash
pnpm add snarkjs
```

#### 3.2 Create Proof Hooks

Create three new hook files. Here's the template (same for all three, just change the proof system):

**`src/hooks/useMazeProofCircomGroth16.ts`**:

```typescript
import { useState, useCallback } from 'react';
import { groth16 } from 'snarkjs';
import { MAX_MOVES } from '../constants/maze';

export interface CircomProofState {
  proving: boolean;
  loaded: boolean;
}

export function useMazeProofCircomGroth16(
  mazeSeed: number,
  mazeGrid: number[][],
  addLog: (content: string) => void,
  setProof: (proof: string) => void
) {
  const [proving, setProving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadArtifacts = useCallback(async () => {
    if (loaded) return;

    addLog('📦 Loading Groth16 artifacts (~25MB, may take 30-60s)...');
    const start = performance.now();

    try {
      // Preload all files
      await Promise.all([
        fetch('/circom/groth16/maze.wasm'),
        fetch('/circom/groth16/maze_final.zkey'),
        fetch('/circom/groth16/verification_key.json')
      ]);

      const duration = ((performance.now() - start) / 1000).toFixed(1);
      setLoaded(true);
      addLog(`✅ Groth16 artifacts loaded (${duration}s)`);
    } catch (error) {
      addLog('❌ Failed to load Groth16 artifacts');
      console.error(error);
    }
  }, [loaded, addLog]);

  const generateProof = useCallback(
    async (moves: number[]) => {
      try {
        setProving(true);
        setProof('');

        // Ensure artifacts are loaded
        if (!loaded) {
          await loadArtifacts();
        }

        // Prepare inputs
        const paddedMoves = new Array(MAX_MOVES).fill(0);
        moves.forEach((move, i) => {
          if (i < MAX_MOVES) paddedMoves[i] = move;
        });

        // Flatten maze array for Circom
        const mazeFlat = mazeGrid.flat();

        const input = {
          maze_seed: mazeSeed,
          moves: paddedMoves,
          maze: mazeFlat,
        };

        addLog('🧮 Generating Groth16 proof...');
        const proofStart = performance.now();

        const { proof, publicSignals } = await groth16.fullProve(
          input,
          '/circom/groth16/maze.wasm',
          '/circom/groth16/maze_final.zkey'
        );

        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated Groth16 proof ✅ (${proofDuration}s)`);

        addLog('🔍 Verifying proof...');
        const verifyStart = performance.now();

        const vkeyResponse = await fetch('/circom/groth16/verification_key.json');
        const vkey = await vkeyResponse.json();

        const isValid = await groth16.verify(vkey, publicSignals, proof);

        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
          const proofData = JSON.stringify({ proof, publicSignals });
          const proofSize = new Blob([proofData]).size;
          setProof(btoa(proofData));
          addLog(`🎊 Congratulations! Groth16 proof verified! (${proofSize} bytes)`);
        }
      } catch (error) {
        addLog('❌ Error generating Groth16 proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, mazeGrid, addLog, setProof, loaded, loadArtifacts]
  );

  return {
    proving,
    loaded,
    loadArtifacts,
    generateProof,
  };
}
```

**`src/hooks/useMazeProofCircomPlonk.ts`**: Copy above, replace `groth16` with `plonk` throughout

**`src/hooks/useMazeProofCircomFflonk.ts`**: Copy above, replace `groth16` with `fflonk` throughout

#### 3.3 Update MazeGame Component

**`src/components/MazeGame.tsx`**:

```typescript
import { useState, useEffect, useCallback } from 'react';
// ... other imports
import { useMazeProof } from '../hooks/useMazeProof';
import { useMazeProofCircomGroth16 } from '../hooks/useMazeProofCircomGroth16';
import { useMazeProofCircomPlonk } from '../hooks/useMazeProofCircomPlonk';
import { useMazeProofCircomFflonk } from '../hooks/useMazeProofCircomFflonk';

type ProofSystem = 'noir' | 'circom-groth16' | 'circom-plonk' | 'circom-fflonk';

export default function MazeGame() {
  const [proofSystem, setProofSystem] = useState<ProofSystem>('noir');

  // ... existing state

  // Call all hooks unconditionally (React rules)
  const noirHook = useMazeProof(mazeConfig.seed, addLog, setProof);
  const groth16Hook = useMazeProofCircomGroth16(
    mazeConfig.seed,
    maze,
    addLog,
    setProof
  );
  const plonkHook = useMazeProofCircomPlonk(
    mazeConfig.seed,
    maze,
    addLog,
    setProof
  );
  const fflonkHook = useMazeProofCircomFflonk(
    mazeConfig.seed,
    maze,
    addLog,
    setProof
  );

  // Select active hook based on proof system
  const proofHook = {
    'noir': noirHook,
    'circom-groth16': groth16Hook,
    'circom-plonk': plonkHook,
    'circom-fflonk': fflonkHook,
  }[proofSystem];

  // Auto-load artifacts when switching to Circom system
  useEffect(() => {
    if (proofSystem.startsWith('circom-') && 'loadArtifacts' in proofHook) {
      proofHook.loadArtifacts();
    }
  }, [proofSystem, proofHook]);

  // ... rest of component

  return (
    <div className="min-h-screen bg-[#c0c0c0] p-4 md:p-8">
      {/* ... */}

      {/* Proof System Selector */}
      <div className="mb-4">
        <label className="block font-mono text-sm mb-2">
          Proof System:
        </label>
        <select
          value={proofSystem}
          onChange={(e) => setProofSystem(e.target.value as ProofSystem)}
          className="w-full border-2 border-black p-2 font-mono text-sm"
          disabled={proving || autoSolving}
        >
          <option value="noir">
            Noir + UltraHonk (No setup, ~15KB proof, ~200ms verify)
          </option>
          <option value="circom-groth16">
            Circom + Groth16 (~500B proof, ~50ms verify, 25MB download)
          </option>
          <option value="circom-plonk">
            Circom + PLONK (~1KB proof, ~120ms verify, 18MB download)
          </option>
          <option value="circom-fflonk">
            Circom + FFLONK Beta (~1KB proof, ~70ms verify, 18MB download)
          </option>
        </select>

        {proofSystem.startsWith('circom-') && 'loaded' in proofHook && !proofHook.loaded && (
          <p className="mt-2 text-sm font-mono text-gray-600">
            ⚠️ Large files will be downloaded when you generate a proof
          </p>
        )}
      </div>

      {/* ... rest of UI */}
    </div>
  );
}
```

#### 3.4 Add Proof System Comparison Component

**`src/components/ProofSystemInfo.tsx`**:

```typescript
export function ProofSystemInfo() {
  return (
    <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <h3 className="font-mono font-bold mb-3">Proof System Comparison</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left p-2">System</th>
              <th className="text-left p-2">Setup</th>
              <th className="text-left p-2">Proof Size</th>
              <th className="text-left p-2">Verify Time</th>
              <th className="text-left p-2">Download</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-300">
              <td className="p-2">Noir + UltraHonk</td>
              <td className="p-2">None ✅</td>
              <td className="p-2">~15 KB</td>
              <td className="p-2">~200 ms</td>
              <td className="p-2">~3 MB</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="p-2">Circom + Groth16</td>
              <td className="p-2">Per-circuit</td>
              <td className="p-2">~500 B ⚡</td>
              <td className="p-2">~50 ms ⚡</td>
              <td className="p-2">~25 MB</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="p-2">Circom + PLONK</td>
              <td className="p-2">Universal ✅</td>
              <td className="p-2">~1 KB</td>
              <td className="p-2">~120 ms</td>
              <td className="p-2">~18 MB</td>
            </tr>
            <tr>
              <td className="p-2">Circom + FFLONK</td>
              <td className="p-2">Universal ✅</td>
              <td className="p-2">~1 KB</td>
              <td className="p-2">~70 ms ⚡</td>
              <td className="p-2">~18 MB</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs font-mono text-gray-600">
        <p>⚡ = Best in category</p>
        <p>✅ = No complex setup required</p>
        <p className="mt-2">
          <strong>Note:</strong> FFLONK is in beta. All Circom systems use lazy loading.
        </p>
      </div>
    </div>
  );
}
```

### Phase 4: Build System Integration (Week 4)

#### 4.1 Update package.json

```json
{
  "scripts": {
    "compile:noir": "cd circuit && nargo compile && cp target/circuit.json ../worker/container_src/circuit.json",
    "compile:circom": "node scripts/compile-circom.js",
    "setup:circom": "node scripts/setup-circom.js",
    "compile": "pnpm run compile:noir && pnpm run compile:circom && pnpm run setup:circom",
    "generate": "python3 generate_maze.py 2918957128 --no-preview && node scripts/generate-circom-maze.js",
    "test:noir": "cd circuit && nargo test",
    "test:circom": "cd circuit-circom && node test/maze.test.js",
    "test": "pnpm run test:noir && pnpm run test:circom"
  },
  "devDependencies": {
    "circom": "^2.2.0",
    "snarkjs": "^0.7.5",
    "circom_tester": "^0.0.20"
  }
}
```

#### 4.2 Create Compilation Script

**`scripts/compile-circom.js`**:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function compileCircom() {
  console.log('🔧 Compiling Circom circuit...');

  try {
    // Compile circuit
    const { stdout } = await execAsync(
      'circom circuits/maze.circom --r1cs --wasm --sym -o build/',
      { cwd: './circuit-circom' }
    );

    console.log(stdout);
    console.log('✅ Circuit compiled successfully\n');

    // Check constraint count
    console.log('📊 Checking circuit info...');
    const { stdout: info } = await execAsync(
      'snarkjs r1cs info build/maze.r1cs',
      { cwd: './circuit-circom' }
    );

    console.log(info);

    // Check if under 1M constraints (2^20 limit)
    const match = info.match(/# of Constraints: (\d+)/);
    if (match) {
      const constraints = parseInt(match[1]);
      if (constraints > 1_000_000) {
        console.warn(`⚠️  Warning: ${constraints} constraints exceeds 2^20 limit!`);
      } else {
        console.log(`✅ ${constraints} constraints (within 2^20 limit)`);
      }
    }

  } catch (error) {
    console.error('❌ Compilation failed:', error);
    process.exit(1);
  }
}

compileCircom();
```

#### 4.3 Vite Configuration

**`vite.config.ts`**:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'noir': ['@noir-lang/noir_js'],
          'barretenberg': ['@aztec/bb.js'],
          'snarkjs': ['snarkjs'],
        },
      },
    },
  },
  server: {
    // Required for SharedArrayBuffer (multi-threading)
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

### Phase 5: Testing & Optimization (Week 5)

#### 5.1 Circuit Testing

Create `circuit-circom/test/maze.test.js`:

```javascript
import { wasm as wasm_tester } from 'circom_tester';
import path from 'path';
import fs from 'fs';

describe('Maze Circuit Test', () => {
  let circuit;

  before(async () => {
    circuit = await wasm_tester(
      path.join(__dirname, '../circuits/maze.circom'),
      { include: ['node_modules'] }
    );
  });

  it('Should verify valid solution', async () => {
    const mazeConfig = JSON.parse(
      fs.readFileSync('./src/maze_seed.json', 'utf8')
    );

    // Test with simple valid path
    const input = {
      maze_seed: mazeConfig.seed,
      moves: [1, 2, 1, 2, /* ... */],  // Valid path
      maze: mazeConfig.maze.flat(),
    };

    const witness = await circuit.calculateWitness(input);
    await circuit.checkConstraints(witness);
  });

  it('Should reject invalid maze seed', async () => {
    try {
      await circuit.calculateWitness({
        maze_seed: 999999,  // Wrong seed
        moves: [],
        maze: [],
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'maze_seed');
    }
  });

  // More tests...
});
```

#### 5.2 Browser Testing Checklist

- [ ] Test Noir/UltraHonk in Chrome, Firefox, Safari
- [ ] Test Circom/Groth16 in Chrome, Firefox, Safari
- [ ] Test Circom/PLONK in Chrome, Firefox, Safari
- [ ] Test Circom/FFLONK in Chrome, Firefox, Safari
- [ ] Test switching between proof systems
- [ ] Test lazy loading (verify no download until selected)
- [ ] Test on mobile (iOS Safari, Chrome Mobile)
- [ ] Measure actual proof generation times
- [ ] Measure actual download times
- [ ] Check memory usage (should be < 500MB)

#### 5.3 Performance Optimization

**Add loading progress indicators:**

```typescript
const [downloadProgress, setDownloadProgress] = useState(0);

async function loadWithProgress(url: string) {
  const response = await fetch(url);
  const reader = response.body!.getReader();
  const contentLength = +(response.headers.get('Content-Length') || 0);

  let receivedLength = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedLength += value.length;
    setDownloadProgress((receivedLength / contentLength) * 100);
  }

  return new Blob(chunks);
}
```

### Phase 6: Documentation (Week 6)

#### 6.1 Update README.md

Add section:

```markdown
## Proof Systems

This project supports four different zero-knowledge proof systems:

### 1. Noir + UltraHonk (Default)
- **Setup:** None required
- **Proof Size:** ~15 KB
- **Verification:** ~200 ms
- **Best for:** Quick start, easy development

### 2. Circom + Groth16
- **Setup:** Per-circuit trusted setup
- **Proof Size:** ~500 bytes (smallest!)
- **Verification:** ~50 ms (fastest!)
- **Best for:** On-chain verification, smallest proofs

### 3. Circom + PLONK
- **Setup:** Universal (one-time)
- **Proof Size:** ~1 KB
- **Verification:** ~120 ms
- **Best for:** Balance of ease and performance

### 4. Circom + FFLONK (Beta)
- **Setup:** Universal (one-time)
- **Proof Size:** ~1 KB
- **Verification:** ~70 ms
- **Best for:** Fast verification with universal setup

### Switching Proof Systems

Select your preferred system from the dropdown in the UI. Large files will be lazy-loaded only when you generate a proof with that system.

### Development: Adding a New Circom System

If snarkjs adds new proof systems:

1. Add setup in `scripts/setup-circom.js`
2. Create new hook in `src/hooks/useMazeProofCircom[System].ts`
3. Add to selector in `MazeGame.tsx`
4. Update comparison table
```

#### 6.2 Create docs/proof-systems-technical.md

Detailed technical documentation covering:
- How each system works
- File format specifications
- Trusted setup details
- Security considerations
- Performance benchmarks

## Success Criteria

- ✅ All four proof systems work correctly in browser
- ✅ Circuit produces same results as Noir version
- ✅ Lazy loading prevents huge initial bundle
- ✅ Proof generation completes in < 60s for all systems
- ✅ All proofs verify successfully
- ✅ Works in Chrome, Firefox, Safari (latest versions)
- ✅ Mobile browser support (may be slower but functional)
- ✅ Clear UI showing system differences and tradeoffs
- ✅ User can switch systems without page reload
- ✅ Proper error handling and user feedback

## Timeline

**Total: 6 weeks**

- **Week 1-2:** Circom circuit development and testing
- **Week 2:** Trusted setup for all three systems
- **Week 3-4:** Browser integration, hooks, and UI
- **Week 4:** Build system and automation
- **Week 5:** Testing, optimization, and UX polish
- **Week 6:** Documentation and final testing

## Future Enhancements

1. **On-Chain Verification:** Deploy Solidity verifiers for Ethereum
2. **Proof Aggregation:** Combine multiple proofs
3. **Progressive Loading:** Stream large zkey files
4. **Worker Threads:** Move proof generation off main thread
5. **IndexedDB Caching:** Cache artifacts locally
6. **More Systems:** Add as snarkjs adds support
7. **Benchmarking Dashboard:** Compare real-world performance
8. **Educational Mode:** Explain each system step-by-step

## File Size Budget

| System | WASM | Zkey | Vkey | Total |
|--------|------|------|------|-------|
| Noir/UltraHonk | - | - | - | ~3MB |
| Circom/Groth16 | 3MB | 20MB | 2KB | ~23MB |
| Circom/PLONK | 3MB* | 15MB | 2KB | ~18MB |
| Circom/FFLONK | 3MB* | 15MB | 2KB | ~18MB |

*Shared with Groth16

**Total with all systems:** ~62MB (but lazy loading means only one loaded at a time)

## Maintenance

When maze changes:
- **Noir:** Just recompile (`pnpm run compile:noir`)
- **Circom/Groth16:** Re-run full setup including contribution
- **Circom/PLONK:** Re-run setup (no contribution needed)
- **Circom/FFLONK:** Re-run setup (no contribution needed)

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [PLONK Paper](https://eprint.iacr.org/2019/953)
- [FFLONK Paper](https://eprint.iacr.org/2021/1167)
- [Noir Documentation](https://noir-lang.org/)
- [Barretenberg Repository](https://github.com/AztecProtocol/barretenberg)
