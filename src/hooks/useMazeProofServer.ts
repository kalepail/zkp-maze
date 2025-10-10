import { useState, useCallback } from 'react';
import { MAX_MOVES } from '../constants/maze';

export interface ProofState {
  proving: boolean;
}

export function useMazeProofServer(
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void
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

        addLog('🔥 Warming up container...');

        // Step 0: Health check to warm up the container
        const healthStart = performance.now();
        const healthResponse = await fetch('/api/health');
        if (!healthResponse.ok) {
          throw new Error('Health check failed - proof service is not ready');
        }
        const healthDuration = ((performance.now() - healthStart) / 1000).toFixed(1);
        addLog(`Container ready ✅ (${healthDuration}s)`);

        addLog('🧮 Generating witness...');

        // Step 1: Generate witness from circuit inputs
        const witnessStart = performance.now();
        const witnessResponse = await fetch('/api/witness', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            maze_seed: String(mazeSeed),
            moves: paddedMoves,
          }),
        });

        if (!witnessResponse.ok) {
          const error = await witnessResponse.json() as { message?: string };
          throw new Error(error.message || 'Failed to generate witness');
        }

        const { witness } = await witnessResponse.json() as { witness: string };
        const witnessDuration = ((performance.now() - witnessStart) / 1000).toFixed(1);
        addLog(`Generated witness ✅ (${witnessDuration}s)`);

        addLog('🔐 Generating proof...');

        // Step 2: Generate proof from witness
        const proofStart = performance.now();
        const proveResponse = await fetch('/api/prove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            witness,
          }),
        });

        if (!proveResponse.ok) {
          const error = await proveResponse.json() as { message?: string };
          throw new Error(error.message || 'Failed to generate proof');
        }

        const proofResult = await proveResponse.json() as { proof: string; publicInputs: string[] };
        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${proofDuration}s)`);

        addLog('🔍 Verifying proof...');

        // Step 3: Verify the proof
        const verifyStart = performance.now();
        const verifyResponse = await fetch('/api/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            proof: proofResult.proof,
            publicInputs: proofResult.publicInputs
          }),
        });

        if (!verifyResponse.ok) {
          const error = await verifyResponse.json() as { message?: string };
          throw new Error(error.message || 'Failed to verify proof');
        }

        const { valid } = await verifyResponse.json() as { valid: boolean };
        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${valid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (valid) {
          // Store proof as base64 for display
          setProof(proofResult.proof);
          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        }
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog, setProof]
  );

  return {
    proving,
    generateProof,
  };
}
