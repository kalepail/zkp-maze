import { useState, useCallback, useRef, useEffect } from 'react';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { MAX_MOVES } from '../constants/maze';
import circuitJson from '../../circuit/target/circuit.json';

const circuit = circuitJson as CompiledCircuit;

export interface ProofState {
  proving: boolean;
}

type ProofMode = 'local' | 'server';

export function useMazeProof(
  mode: ProofMode,
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void
) {
  const [proving, setProving] = useState(false);
  const [warmedUp, setWarmedUp] = useState(false);
  const noirRef = useRef<Noir | null>(null);
  const backendRef = useRef<UltraHonkBackend | null>(null);

  // Initialize Noir and UltraHonkBackend once
  useEffect(() => {
    noirRef.current = new Noir(circuit);
    backendRef.current = new UltraHonkBackend(circuit.bytecode, { threads: navigator.hardwareConcurrency });

    // Cleanup on unmount
    return () => {
      if (backendRef.current) {
        backendRef.current.destroy();
      }
    };
  }, []);

  const warmupContainer = useCallback(async () => {
    if (mode === 'local' || warmedUp) return;

    try {
      addLog('🔥 Warming up remote container...');
      const warmupStart = performance.now();
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error('Health check failed - proof service is not ready');
      }
      const warmupDuration = ((performance.now() - warmupStart) / 1000).toFixed(1);
      addLog(`Container warmed up ✅ (${warmupDuration}s)`);
      setWarmedUp(true);
    } catch (error) {
      addLog('❌ Container warmup failed');
      console.error('Container warmup error:', error);
      throw error;
    }
  }, [mode, warmedUp, addLog]);

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

        const noir = noirRef.current!;
        const backend = backendRef.current!;

        // Warmup container if using server mode
        if (mode === 'server') {
          await warmupContainer();
        }

        // Step 1: Generate witness locally
        const witnessLog = mode === 'server' ? '🧮 Generating witness locally...' : '🧮 Generating witness...';
        addLog(witnessLog);
        const witnessStart = performance.now();
        const { witness } = await noir.execute({
          maze_seed: mazeSeed.toString(),
          moves: paddedMoves,
        });
        const witnessDuration = ((performance.now() - witnessStart) / 1000).toFixed(1);
        addLog(`Generated witness ✅ (${witnessDuration}s)`);

        // Step 2: Generate proof (local or remote)
        const proofLog = mode === 'server' ? '🔐 Generating proof remotely...' : '🔐 Generating proof...';
        addLog(proofLog);
        const proofStart = performance.now();

        let proofData;
        if (mode === 'local') {
          // Local mode: backend generates proof and extracts public inputs
          proofData = await backend.generateProof(witness);
        } else {
          // Server mode: Send witness to remote prover
          const proveResponse = await fetch('/api/prove', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: new Uint8Array(witness),
          });

          if (!proveResponse.ok) {
            const errorText = await proveResponse.text();
            throw new Error(`Failed to generate proof: ${errorText}`);
          }

          const proofBuffer = await proveResponse.arrayBuffer();
          const proofBytes = new Uint8Array(proofBuffer);

          // Server returns raw proof bytes; public inputs may be embedded in UltraHonk proofs
          proofData = {
            proof: proofBytes,
            publicInputs: [],
          };
        }

        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${proofDuration}s)`);

        // Step 3: Verify proof locally
        const verifyLog = mode === 'server' ? '🔍 Verifying proof locally...' : '🔍 Verifying proof...';
        addLog(verifyLog);
        const verifyStart = performance.now();
        const isValid = await backend.verifyProof(proofData);
        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
          // Convert proof to base64 string
          const proofBase64 = btoa(String.fromCharCode(...proofData.proof));
          setProof(proofBase64);
          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        }
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mode, mazeSeed, addLog, setProof, warmupContainer]
  );

  return {
    proving,
    generateProof,
    warmupContainer,
  };
}
