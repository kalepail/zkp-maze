import { useState, useCallback } from 'react';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { MAX_MOVES } from '../constants/maze';
import circuitJson from '../../circuit/target/circuit.json';

const circuit = circuitJson as CompiledCircuit;

export interface ProofState {
  proving: boolean;
  proof: string;
  logs: string[];
}

export function useMazeProof(mazeSeed: number) {
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

        addLog('🔧 Initializing Noir circuit...');
        const noir = new Noir(circuit);

        addLog('🔧 Initializing backend...');
        const backend = new UltraHonkBackend(
          circuit.bytecode, 
          { 
            threads: Math.floor(navigator.hardwareConcurrency * 0.75)
          },
          // {
          //   recursive: true
          // }
        );
        
        addLog('🧮 Generating witness...');
        const { witness } = await noir.execute({
          maze_seed: mazeSeed.toString(),
          moves: paddedMoves,
        });
        addLog('Generated witness ✅');

        addLog('🔐 Generating proof...');
        const proofData = await backend.generateProof(witness);
        addLog('Generated proof ✅');
        setProof(proofData.proof.toString());

        addLog('🔍 Verifying proof...');
        const isValid = await backend.verifyProof(proofData);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);

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
    [circuit, mazeSeed, addLog]
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
