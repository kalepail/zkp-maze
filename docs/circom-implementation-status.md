# Circom Integration Implementation Status

## ✅ Completed

### Circuit Development
- ✅ Created Circom maze verifier circuit (`circuit-circom/circuits/maze.circom`)
  - Simplified design with ~17K constraints (vs 3M+ with full verification)
  - Supports 350 moves (sufficient for 312-move solution)
  - Verifies: maze seed, move bounds, end position reached
  - **Trade-off**: Does not verify wall collisions (reduces complexity)

- ✅ Created maze configuration generator (`scripts/generate-circom-maze.js`)
  - Auto-generates Circom config from Noir maze config
  - Integrated into `npm run generate` script

### Build System
- ✅ Circuit compilation script (`scripts/compile-circom.js`)
  - Compiles circuit to R1CS, WASM, and symbols
  - Reports constraint count and verifies against 2^16 limit
  - Usage: `npm run compile:circom`

- ✅ Trusted setup script (`scripts/setup-circom.js`)
  - Sets up Groth16 (✅ working)
  - Sets up PLONK (✅ working)
  - Attempts FFLONK (⚠️ not supported in current snarkjs version)
  - Downloads Powers of Tau file automatically if missing
  - Copies artifacts to `public/circom/` for browser access
  - Usage: `npm run setup:circom`

### Package Configuration
- ✅ Updated `package.json` with new scripts:
  - `compile:circom` - Compile Circom circuit
  - `setup:circom` - Run trusted setup
  - `compile:all` - Compile both Noir and Circom
  - `generate` - Now also generates Circom config

- ✅ Added dependencies:
  - `snarkjs` ^0.7.5
  - `circomlib` ^2.0.5
  - `circom_tester` ^0.0.20

### Browser Integration
- ✅ Created proof generation hooks:
  - `src/hooks/useMazeProofCircomGroth16.ts`
  - `src/hooks/useMazeProofCircomPlonk.ts`
  - Both support lazy loading, proof generation, and verification

### Build Artifacts
- ✅ Generated files in `public/circom/`:
  - `groth16/maze.wasm` (0.10 MB)
  - `groth16/maze_final.zkey` (8.18 MB)
  - `groth16/verification_key.json`
  - `plonk/maze.wasm` (0.10 MB)
  - `plonk/maze_final.zkey` (47.70 MB)
  - `plonk/verification_key.json`
  - Total: ~56 MB (lazy-loaded)

## 🚧 Remaining Work

### 1. MazeGame Component Integration (High Priority)

The MazeGame component needs to be updated to support multiple proof systems:

```typescript
// Add proof system selector
type ProofSystem = 'noir-local' | 'noir-server' | 'circom-groth16' | 'circom-plonk';
const [proofSystem, setProofSystem] = useState<ProofSystem>('noir-local');

// Initialize all hooks (React rules - must call unconditionally)
const noirLocalHook = useMazeProof('local', mazeConfig.seed, addLog, setProof);
const noirServerHook = useMazeProof('server', mazeConfig.seed, addLog, setProof);
const groth16Hook = useMazeProofCircomGroth16(mazeConfig.seed, addLog, setProof);
const plonkHook = useMazeProofCircomPlonk(mazeConfig.seed, addLog, setProof);

// Select active hook
const proofHook = {
  'noir-local': noirLocalHook,
  'noir-server': noirServerHook,
  'circom-groth16': groth16Hook,
  'circom-plonk': plonkHook,
}[proofSystem];

// Auto-load Circom artifacts when switching
useEffect(() => {
  if (proofSystem.startsWith('circom-') && 'loadArtifacts' in proofHook) {
    proofHook.loadArtifacts();
  }
}, [proofSystem, proofHook]);
```

### 2. GameControls Component Update

Add proof system selector to GameControls:

```typescript
<div className="space-y-2">
  <label className="block font-mono text-sm font-semibold">
    Proof System:
  </label>
  <select
    value={proofSystem}
    onChange={(e) => setProofSystem(e.target.value as ProofSystem)}
    className="w-full border-2 border-black p-2 font-mono text-sm"
    disabled={proving || autoSolving}
  >
    <option value="noir-local">Noir + UltraHonk (Local, ~15KB proof)</option>
    <option value="noir-server">Noir + UltraHonk (Server, ~15KB proof)</option>
    <option value="circom-groth16">Circom + Groth16 (~500B proof, 8MB download)</option>
    <option value="circom-plonk">Circom + PLONK (~1KB proof, 48MB download)</option>
  </select>

  {proofSystem.startsWith('circom-') && 'loaded' in proofHook && !proofHook.loaded && (
    <p className="text-sm font-mono text-gray-600">
      ⚠️ Large files will be downloaded when you generate a proof
    </p>
  )}
</div>
```

### 3. Proof System Comparison Component (Optional)

Create `src/components/ProofSystemInfo.tsx` to educate users:

```typescript
export function ProofSystemInfo() {
  return (
    <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <h3 className="font-mono font-bold mb-3">Proof System Comparison</h3>
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
            <td className="p-2">~8 MB</td>
          </tr>
          <tr>
            <td className="p-2">Circom + PLONK</td>
            <td className="p-2">Universal ✅</td>
            <td className="p-2">~1 KB</td>
            <td className="p-2">~120 ms</td>
            <td className="p-2">~48 MB</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 text-xs font-mono text-gray-600">
        <p>⚡ = Best in category</p>
        <p>✅ = No complex setup required</p>
        <p className="mt-2">
          <strong>Note:</strong> Circom circuits use simplified verification (bounds + end position only).
          For full maze structure verification, use Noir.
        </p>
      </div>
    </div>
  );
}
```

### 4. Vite Configuration (Low Priority)

Update `vite.config.ts` for better code splitting:

```typescript
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
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

### 5. Documentation Updates

#### README.md

Add section:

```markdown
## Proof Systems

This project supports multiple zero-knowledge proof systems:

### Noir + UltraHonk (Default)
- **Setup:** None required
- **Proof Size:** ~15 KB
- **Verification:** ~200 ms
- **Verification:** Full maze structure + valid path
- **Best for:** Quick start, easy development, complete security

### Circom + Groth16
- **Setup:** Per-circuit trusted setup
- **Proof Size:** ~500 bytes (smallest!)
- **Verification:** ~50 ms (fastest!)
- **Verification:** Bounds checking + end position only (simplified)
- **Best for:** On-chain verification, smallest proofs
- **Download:** ~8 MB

### Circom + PLONK
- **Setup:** Universal (one-time)
- **Proof Size:** ~1 KB
- **Verification:** ~120 ms
- **Verification:** Bounds checking + end position only (simplified)
- **Best for:** Balance of ease and performance
- **Download:** ~48 MB

### Development

```bash
# Compile and setup all proof systems
npm run generate           # Generate maze config for both systems
npm run compile:all        # Compile both Noir and Circom circuits

# Or individually
npm run compile:noir       # Compile Noir circuit only
npm run compile:circom     # Compile Circom circuit only
npm run setup:circom       # Run Circom trusted setup
```

## ⚠️ Important Limitations

### Circom Circuit Simplifications

The Circom implementation uses a simplified verification approach to keep constraint count manageable:

**Verified:**
- ✅ Maze seed matches
- ✅ All moves stay within grid bounds
- ✅ End position is reached

**Not Verified:**
- ❌ Moves don't hit walls (wall collision detection)
- ❌ Maze structure correctness

**Why?** Full maze verification with dynamic array indexing creates 3M+ constraints (beyond 2^20 limit for Powers of Tau 16). The simplified approach uses only ~17K constraints.

**Security Impact:** The Circom proofs demonstrate you found *a path* to the end within bounds, but don't prove it's a *valid path* through the maze. For full verification, use the Noir circuit.

**Trade-off Table:**

| Aspect | Noir Circuit | Circom Circuit |
|--------|--------------|----------------|
| Constraints | ~200K | ~17K |
| Verification | Full | Simplified |
| Proof Size | ~15 KB | ~500B-1KB |
| Setup Complexity | None | Trusted Setup |
| Best Use Case | Production | Demo/Comparison |

## 🎯 Next Steps

1. **Integrate UI components** - Update MazeGame to support proof system selection
2. **Test browser integration** - Verify Groth16 and PLONK work in-browser
3. **Performance benchmarks** - Measure actual proving times across systems
4. **Document security model** - Clearly explain verification trade-offs
5. **Optional: Add FFLONK** - When supported in newer snarkjs versions

## 📁 File Structure

```
.
├── circuit/                      # Noir circuit (existing)
├── circuit-circom/              # Circom circuits (new)
│   ├── circuits/
│   │   ├── maze.circom          # Main circuit
│   │   └── maze_config.circom   # Auto-generated config
│   ├── build/                   # Compilation outputs
│   │   ├── maze.r1cs
│   │   ├── maze_js/maze.wasm
│   │   ├── groth16/
│   │   │   ├── maze_final.zkey
│   │   │   └── verification_key.json
│   │   └── plonk/
│   │       ├── maze_final.zkey
│   │       └── verification_key.json
│   └── ptau/                    # Powers of Tau files
│       └── powersOfTau28_hez_final_16.ptau
├── public/circom/               # Browser-accessible artifacts
│   ├── groth16/
│   ├── plonk/
│   └── fflonk/
├── scripts/                     # Build scripts
│   ├── compile-circom.js
│   ├── generate-circom-maze.js
│   └── setup-circom.js
└── src/hooks/                   # Browser integration
    ├── useMazeProof.ts          # Noir (existing)
    ├── useMazeProofCircomGroth16.ts
    └── useMazeProofCircomPlonk.ts
```

## 🔧 Commands

```bash
# Development
npm run generate              # Generate maze for both systems
npm run compile:noir          # Compile Noir circuit
npm run compile:circom        # Compile Circom circuit
npm run setup:circom          # Trusted setup (Groth16 + PLONK)
npm run compile:all           # Full compilation pipeline

# Testing
npm run test:noir             # Test Noir circuit
npm run test:circom           # Test Circom circuit
npm run test                  # Test both

# Development Server
npm run dev                   # Start dev server
```

## 📚 Resources

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [PLONK Paper](https://eprint.iacr.org/2019/953)
- [Original Integration Plan](./circom-integration-plan.md)
