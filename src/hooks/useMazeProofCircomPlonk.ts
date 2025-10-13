import { useState, useCallback, useRef } from 'react';
import { plonk } from 'snarkjs';
import { MAX_MOVES_CIRCOM } from '../constants/maze';

const MAX_MOVES = MAX_MOVES_CIRCOM;

export interface CircomProofState {
  proving: boolean;
  loaded: boolean;
}

export function useMazeProofCircomPlonk(
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void
) {
  const [proving, setProving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  const loadArtifacts = useCallback(async () => {
    if (loaded || loadingRef.current) return;

    loadingRef.current = true;
    addLog('📦 Loading PLONK artifacts (~48MB, may take 30-60s)...');
    const start = performance.now();

    try {
      // Preload all files to check they exist
      const wasmRes = await fetch('/circom/plonk/maze.wasm');
      const zkeyRes = await fetch('/circom/plonk/maze_final.zkey');
      const vkeyRes = await fetch('/circom/plonk/verification_key.json');

      if (!wasmRes.ok || !zkeyRes.ok || !vkeyRes.ok) {
        throw new Error('Failed to load artifacts');
      }

      const duration = ((performance.now() - start) / 1000).toFixed(1);
      setLoaded(true);
      addLog(`✅ PLONK artifacts loaded (${duration}s)`);
    } catch (error) {
      addLog('❌ Failed to load PLONK artifacts');
      console.error(error);
    } finally {
      loadingRef.current = false;
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

        // Pad moves array to MAX_MOVES
        const paddedMoves = new Array(MAX_MOVES).fill(0);
        moves.forEach((move, i) => {
          if (i < MAX_MOVES) paddedMoves[i] = move;
        });

        if (moves.length > MAX_MOVES) {
          addLog(`⚠️  Warning: Solution has ${moves.length} moves, but circuit only supports ${MAX_MOVES}`);
          addLog(`   Using first ${MAX_MOVES} moves only`);
        }

        const input = {
          maze_seed: mazeSeed,
          moves: paddedMoves,
        };

        addLog('🧮 Generating PLONK proof (this may take 20-40s)...');
        const proofStart = performance.now();

        const { proof, publicSignals } = await plonk.fullProve(
          input,
          '/circom/plonk/maze.wasm',
          '/circom/plonk/maze_final.zkey'
        );

        const proofDuration = ((performance.now() - proofStart) / 1000).toFixed(1);
        addLog(`Generated PLONK proof ✅ (${proofDuration}s)`);

        addLog('🔍 Verifying proof...');
        const verifyStart = performance.now();

        const vkeyResponse = await fetch('/circom/plonk/verification_key.json');
        const vkey = await vkeyResponse.json();

        const isValid = await plonk.verify(vkey, publicSignals, proof);

        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${verifyDuration}s)`);

        if (isValid) {
          const proofData = JSON.stringify({ proof, publicSignals }, null, 2);
          const proofSize = new Blob([proofData]).size;
          setProof(btoa(proofData));
          addLog(`🎊 Congratulations! PLONK proof verified! (${proofSize} bytes)`);
        }
      } catch (error) {
        addLog('❌ Error generating PLONK proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog, setProof, loaded, loadArtifacts]
  );

  return {
    proving,
    loaded,
    loadArtifacts,
    generateProof,
  };
}
