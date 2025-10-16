import type { ProofProvider } from '../constants/provider';

interface GameControlsProps {
  won: boolean;
  proving: boolean;
  autoSolving: boolean;
  provider: ProofProvider;
  onProviderChange: (provider: ProofProvider) => void;
  onGenerateProof: () => void;
  onAutoSolve: () => void;
  onReset: () => void;
}

export default function GameControls({
  won,
  proving,
  autoSolving,
  provider,
  onProviderChange,
  onGenerateProof,
  onAutoSolve,
  onReset,
}: GameControlsProps) {
  const isNoir = provider === 'noir-local' || provider === 'noir-remote';
  const isRisc0 = provider === 'risc0';

  return (
    <div className="space-y-3 mt-3">
      {/* Provider toggle buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onProviderChange(isRisc0 ? 'noir-local' : 'risc0')}
          disabled={proving}
          className="px-4 py-2 bg-black text-white font-mono text-sm border-2 border-black hover:bg-white hover:text-black active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          aria-label="Toggle between Noir and RISC Zero providers"
        >
          {isRisc0 ? '🧩 Switch to Noir' : '⚡ Switch to RISC Zero'}
        </button>
      </div>

      {/* Noir-specific: Local/Remote toggle */}
      {isNoir && (
        <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={provider === 'noir-local'}
            onChange={(e) => onProviderChange(e.target.checked ? 'noir-local' : 'noir-remote')}
            disabled={proving}
            className="w-4 h-4 border-2 border-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span>Solve Locally (in-browser)</span>
        </label>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
        onClick={onGenerateProof}
        disabled={!won || proving || autoSolving}
        className="px-6 py-2 bg-black text-white font-mono border-2 border-black hover:bg-white hover:text-black active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Generate zero-knowledge proof of your solution"
      >
        {proving ? 'Proving...' :
          isRisc0 ? 'Generate Proof (RISC Zero)' :
          `Generate Proof (${provider === 'noir-local' ? 'local' : 'remote'})`}
      </button>
      <button
        onClick={onAutoSolve}
        disabled={won || proving || autoSolving}
        className="px-6 py-2 bg-green-700 text-white font-mono border-2 border-black hover:bg-green-600 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Automatically solve the maze"
      >
        {autoSolving ? 'Solving...' : 'Auto Solve'}
      </button>
      <button
        onClick={onReset}
        disabled={autoSolving || proving}
        className="px-6 py-2 bg-white text-black font-mono border-2 border-black hover:bg-black hover:text-white active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Reset the maze to start position"
      >
        Reset
      </button>
      </div>
    </div>
  );
}
