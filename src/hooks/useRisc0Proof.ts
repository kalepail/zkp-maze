import { useState, useCallback, useRef } from 'react';
import { risc0Api, type MazeProof, type PathProof } from '../utils/risc0Api';

export interface Risc0ProofState {
  proving: boolean;
  mazeProof: MazeProof | null;
  serverHealthy: boolean;
  checkingHealth: boolean;
}

export function useRisc0Proof(
  mazeSeed: number,
  addLog: (content: string) => void,
  setProof: (proof: string) => void
) {
  const [proving, setProving] = useState(false);
  const [serverHealthy, setServerHealthy] = useState<boolean>(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const mazeProofRef = useRef<MazeProof | null>(null);
  const inflightMazeProofRef = useRef<{ seed: number; promise: Promise<MazeProof> } | null>(null);

  /**
   * Check server health
   */
  const checkHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const health = await risc0Api.checkHealth();
      setServerHealthy(health.status === 'healthy');
      addLog(`🏥 RISC Zero server status: ${health.status}`);
      return true;
    } catch (error) {
      setServerHealthy(false);
      addLog('❌ RISC Zero server unreachable');
      console.error('Health check error:', error);
      return false;
    } finally {
      setCheckingHealth(false);
    }
  }, [addLog]);

  /**
   * Generate maze proof (called once when switching to RISC Zero)
   * Accepts optional skipHealthCheck parameter to bypass health check when already verified
   */
  const generateMazeProof = useCallback(async (skipHealthCheck = false) => {
    // Skip if we already have a maze proof for this seed
    if (mazeProofRef.current?.maze_seed === mazeSeed) {
      return mazeProofRef.current;
    }

    // If there's already an inflight request for this seed, return it
    if (inflightMazeProofRef.current?.seed === mazeSeed) {
      return inflightMazeProofRef.current.promise;
    }

    // Create and store the promise for inflight tracking
    const mazeProofPromise = (async () => {
      try {
        // Check health first if not skipped
        if (!skipHealthCheck) {
          try {
            const health = await risc0Api.checkHealth();
            const isHealthy = health.status === 'healthy';
            setServerHealthy(isHealthy);

            if (!isHealthy) {
              const error = 'Cannot generate maze proof: RISC Zero server is not healthy';
              addLog(`❌ ${error}`);
              throw new Error(error);
            }
          } catch (error) {
            setServerHealthy(false);
            const errorMsg = 'Cannot generate maze proof: RISC Zero server unreachable';
            addLog(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }

        const start = performance.now();
        const mazeProof = await risc0Api.generateMaze(mazeSeed);
        const duration = ((performance.now() - start) / 1000).toFixed(1);

        mazeProofRef.current = mazeProof;
        addLog(`Maze proof generated ✅ (${duration}s)`);

        return mazeProof;
      } catch (error) {
        addLog('❌ Failed to generate maze proof');
        console.error(error);
        throw error;
      } finally {
        // Clear inflight tracking when done (only if it's still for this seed)
        if (inflightMazeProofRef.current?.seed === mazeSeed) {
          inflightMazeProofRef.current = null;
        }
      }
    })();

    // Store the promise and seed before returning it
    inflightMazeProofRef.current = { seed: mazeSeed, promise: mazeProofPromise };
    return mazeProofPromise;
  }, [mazeSeed, addLog]);

  /**
   * Generate and verify path proof
   */
  const generateProof = useCallback(
    async (moves: number[]) => {
      try {
        setProving(true);
        setProof('');

        // Step 1: Ensure we have a maze proof
        let mazeProof = mazeProofRef.current;
        if (!mazeProof || mazeProof.maze_seed !== mazeSeed) {
          // Log immediately so user knows what's happening
          addLog(`🎲 Generating maze proof for seed ${mazeSeed}...`);
          // generateMazeProof will check health if needed
          mazeProof = await generateMazeProof(false);
        }

        // Step 2: Verify path and generate proof
        addLog(`🔐 Generating proof...`);
        const verifyStart = performance.now();

        const pathProof: PathProof = await risc0Api.verifyPath(mazeProof, moves);

        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Generated proof ✅ (${verifyDuration}s)`);

        // Step 3: Cryptographically verify the receipt
        addLog('🔍 Verifying proof...');
        const cryptoVerifyStart = performance.now();

        const verifyResult = await risc0Api.verifyProof(pathProof);

        const cryptoVerifyDuration = ((performance.now() - cryptoVerifyStart) / 1000).toFixed(1);
        const isValid = pathProof.is_valid && verifyResult.success;
        addLog(`Proof is ${isValid ? 'VALID ✅' : 'INVALID ❌'} (${cryptoVerifyDuration}s)`);

        // Step 4: Display results
        if (isValid) {
          // Format the proof for display
          const proofDisplay = formatRisc0Proof(pathProof);
          setProof(proofDisplay);

          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        } else if (!pathProof.is_valid) {
          setProof('Path verification failed: Invalid path');
        } else {
          setProof('Receipt verification failed: Proof is not cryptographically valid');
        }
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog, setProof, generateMazeProof]
  );

  /**
   * Set the maze proof cache directly (for when maze is generated externally)
   */
  const setMazeProofCache = useCallback((mazeProof: MazeProof) => {
    mazeProofRef.current = mazeProof;
    // Clear any inflight request tracking since we now have the result
    if (inflightMazeProofRef.current?.seed === mazeProof.maze_seed) {
      inflightMazeProofRef.current = null;
    }
  }, []);

  return {
    proving,
    serverHealthy,
    checkingHealth,
    generateProof,
    checkHealth,
    generateMazeProof,
    setMazeProofCache,
  };
}

/**
 * Format RISC Zero proof for display
 */
function formatRisc0Proof(pathProof: PathProof): string {
  const lines = [
    '=== RISC Zero Path Verification Proof ===',
    '',
    `Maze Seed: ${pathProof.maze_seed}`,
    `Validation: ${pathProof.is_valid ? 'VALID ✓' : 'INVALID ✗'}`,
    '',
    '--- Receipt (Proof) ---',
    risc0Api.formatReceipt(pathProof.receipt),
    '',
    'This proof cryptographically attests that:',
    '  1. The path was verified against maze seed ' + pathProof.maze_seed,
    '  2. The computation was executed correctly',
    '  3. The result can be verified by anyone',
  ];

  return lines.join('\n');
}
