import { useState, useCallback } from 'react';
import { MAX_MOVES } from '../constants/maze';

export interface ProofState {
  proving: boolean;
  proof: string;
  logs: string[];
}

export function useMazeProofServer(mazeSeed: number) {
  const [proving, setProving] = useState(false);
  const [proof, setProof] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((content: string) => {
    setLogs((prev) => [...prev, content]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const clearProof = useCallback(() => {
    setProof('');
  }, []);

  const generateProof = useCallback(
    async (moves: number[], _playerPos: [number, number], _endPos: [number, number]) => {
      try {
        setProving(true);
        setProof('');

        addLog(`📊 Recorded ${moves.length} moves`);

        // Pad moves array
        const paddedMoves = new Array(MAX_MOVES).fill(0);
        moves.forEach((move, i) => {
          if (i < MAX_MOVES) paddedMoves[i] = move;
        });

        addLog('🔥 Warming up container...');

        // Step 0: Health check to warm up the container
        try {
          const healthResponse = await fetch('/api/health');
          if (healthResponse.ok) {
            addLog(`Container ready ✅`);
          }
        } catch (healthError) {
          addLog('⚠️ Health check failed, proceeding anyway...');
        }

        addLog('🌐 Generating witness...');

        // Step 1: Generate witness from circuit inputs
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
        addLog('Generated witness ✅');

        addLog('🔐 Generating proof...');

        // Step 2: Generate proof from witness
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
        addLog('Generated proof ✅');

        // Store proof as base64 for display
        setProof(proofResult.proof);

        addLog('🔍 Verifying proof...');

        // Step 3: Verify the proof
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
        addLog(`Proof is ${valid ? 'VALID ✅' : 'INVALID ❌'}`);

        if (valid) {
          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        }
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog]
  );

  return {
    proving,
    proof,
    logs,
    addLog,
    clearLogs,
    clearProof,
    generateProof,
  };
}
