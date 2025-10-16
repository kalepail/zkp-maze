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
   */
  const generateMazeProof = useCallback(async () => {
    // Skip if we already have a maze proof for this seed
    if (mazeProofRef.current?.maze_seed === mazeSeed) {
      return mazeProofRef.current;
    }

    // Don't proceed if server is not healthy
    if (!serverHealthy) {
      const error = 'Cannot generate maze proof: RISC Zero server is not healthy';
      addLog(`❌ ${error}`);
      throw new Error(error);
    }

    try {
      addLog(`🎲 Generating maze proof for seed ${mazeSeed}...`);
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
    }
  }, [mazeSeed, addLog, serverHealthy]);

  /**
   * Generate and verify path proof
   */
  const generateProof = useCallback(
    async (moves: number[]) => {
      // Don't proceed if server is not healthy
      if (!serverHealthy) {
        addLog('❌ Cannot generate proof: RISC Zero server is not healthy');
        return;
      }

      try {
        setProving(true);
        setProof('');

        // Step 1: Ensure we have a maze proof
        let mazeProof = mazeProofRef.current;
        if (!mazeProof || mazeProof.maze_seed !== mazeSeed) {
          mazeProof = await generateMazeProof();
        }

        // Step 2: Verify path and generate proof
        addLog(`🔐 Verifying path with ${moves.length} moves...`);
        const verifyStart = performance.now();

        const pathProof: PathProof = await risc0Api.verifyPath(mazeProof, moves);

        const verifyDuration = ((performance.now() - verifyStart) / 1000).toFixed(1);
        addLog(`Path verification complete ✅ (${verifyDuration}s)`);

        // Step 3: Display results
        if (pathProof.is_valid) {
          addLog('🎊 Path is VALID! Proof generated successfully.');

          // Format the proof for display
          const proofDisplay = formatRisc0Proof(pathProof);
          setProof(proofDisplay);

          addLog('🎊 Congratulations! Your maze solution is cryptographically verified!');
        } else {
          addLog('❌ Path is INVALID');
          setProof('Path verification failed: Invalid path');
        }
      } catch (error) {
        addLog('❌ Error generating proof');
        console.error(error);
      } finally {
        setProving(false);
      }
    },
    [mazeSeed, addLog, setProof, generateMazeProof, serverHealthy]
  );

  return {
    proving,
    serverHealthy,
    checkingHealth,
    generateProof,
    checkHealth,
    generateMazeProof,
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
    '--- Journal (Public Outputs) ---',
    risc0Api.formatJournal(pathProof.journal),
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
