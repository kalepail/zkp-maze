import { useState, useCallback } from 'react';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { MAX_MOVES } from '../constants/maze';
import circuitJson from '../../circuit/target/circuit.json';

const circuit = circuitJson as CompiledCircuit;

export interface ProofState {
  proving: boolean;
}

export function useMazeProof(
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

        const noir = new Noir(circuit);

        const backend = new UltraHonkBackend(circuit.bytecode, { threads: navigator.hardwareConcurrency });
        
        addLog('🧮 Generating witness...');
        const witnessStart = performance.now();
        const { witness } = await noir.execute({
          maze_seed: mazeSeed.toString(),
          moves: paddedMoves,
        });
        const witnessDuration = ((performance.now() - witnessStart) / 1000).toFixed(1);
        addLog(`Generated witness ✅ (${witnessDuration}s)`);

        addLog('🔐 Generating proof...');
        const proofStart = performance.now();
        const proofData = await backend.generateProof(witness);
        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${proofDuration}s)`);

        // Convert proof to base64 string (matching server format)
        const proofBase64 = btoa(String.fromCharCode(...proofData.proof));
        setProof(proofBase64);

        addLog('🔍 Verifying proof...');
        const verifyStart = performance.now();
        const isValid = await backend.verifyProof(proofData);
        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
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
    [mazeSeed, addLog, setProof]
  );

  return {
    proving,
    generateProof,
  };
}
