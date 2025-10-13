import { useState, useCallback } from 'react';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { MAX_MOVES } from '../constants/maze';
import circuitJson from '../../circuit/target/circuit.json';

const circuit = circuitJson as CompiledCircuit;

export interface ProofState {
  proving: boolean;
}

export function useMazeProofServer(
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void
) {
  const [proving, setProving] = useState(false);
  const [warmedUp, setWarmedUp] = useState(false);

  const warmupContainer = useCallback(async () => {
    if (warmedUp) return;

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
  }, [warmedUp, addLog]);

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

        // Step 0: Warmup container if needed
        await warmupContainer();

        addLog('🧮 Generating witness locally...');

        // Step 1: Generate witness locally using Noir
        const noir = new Noir(circuit);
        const witnessStart = performance.now();
        const { witness } = await noir.execute({
          maze_seed: mazeSeed.toString(),
          moves: paddedMoves,
        });
        const witnessDuration = ((performance.now() - witnessStart) / 1000).toFixed(1);
        addLog(`Generated witness ✅ (${witnessDuration}s)`);

        addLog('🔐 Generating proof remotely...');

        // Step 3: Send witness bytes to /prove endpoint
        const proofStart = performance.now();
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

        // Step 4: Handle proof response
        const proofBuffer = await proveResponse.arrayBuffer();
        const proofBytes = new Uint8Array(proofBuffer);
        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${proofDuration}s)`);

        addLog('🔍 Verifying proof locally...');

        // Step 5: Verify proof locally using UltraHonkBackend
        const backend = new UltraHonkBackend(circuit.bytecode, { threads: navigator.hardwareConcurrency });
        const verifyStart = performance.now();

        // Create proof data object with the correct structure
        const proofData = {
          proof: proofBytes,
          publicInputs: [], // Public inputs should be extracted from the proof if needed
        };

        const isValid = await backend.verifyProof(proofData);
        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
          // Convert proof to base64 string for display
          const proofBase64 = btoa(String.fromCharCode(...proofBytes));
          setProof(proofBase64);
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
    [mazeSeed, addLog, setProof, warmupContainer]
  );

  return {
    proving,
    generateProof,
    warmupContainer,
  };
}
