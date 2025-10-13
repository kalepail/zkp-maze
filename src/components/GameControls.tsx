import type { ProofSystemType } from '../types/proofSystem';
import { PROOF_SYSTEMS } from '../types/proofSystem';

interface GameControlsProps {
  won: boolean;
  proving: boolean;
  autoSolving: boolean;
  useLocalProof: boolean;
  proofSystem: ProofSystemType;
  onUseLocalProofChange: (useLocal: boolean) => void;
  onProofSystemChange: (system: ProofSystemType) => void;
  onGenerateProof: () => void;
  onAutoSolve: () => void;
  onReset: () => void;
}

export default function GameControls({
  won,
  proving,
  autoSolving,
  useLocalProof,
  proofSystem,
  onUseLocalProofChange,
  onProofSystemChange,
  onGenerateProof,
  onAutoSolve,
  onReset,
}: GameControlsProps) {
  return (
    <div className="space-y-3 mt-3">
      {/* Proof mode toggle */}
      <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={useLocalProof}
          onChange={(e) => onUseLocalProofChange(e.target.checked)}
          disabled={proving}
          className="w-4 h-4 border-2 border-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span>Solve Locally (in-browser)</span>
      </label>

      {/* Proof system selector - only shown for local mode */}
      {useLocalProof && (
        <div className="space-y-1">
          <label className="block font-mono text-sm font-semibold text-gray-700">
            Proof System:
          </label>
          <select
            value={proofSystem}
            onChange={(e) => onProofSystemChange(e.target.value as ProofSystemType)}
            disabled={proving || autoSolving}
            className="w-full border-2 border-black p-2 font-mono text-sm bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {Object.values(PROOF_SYSTEMS).map((system) => (
              <option key={system.id} value={system.id}>
                {system.name} - {system.description}
              </option>
            ))}
          </select>
          <p className="text-xs font-mono text-gray-600 mt-1">
            {PROOF_SYSTEMS[proofSystem].proofSize} proof • {PROOF_SYSTEMS[proofSystem].verifyTime} verify • {PROOF_SYSTEMS[proofSystem].downloadSize} download
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
        onClick={onGenerateProof}
        disabled={!won || proving || autoSolving}
        className="px-6 py-2 bg-black text-white font-mono border-2 border-black hover:bg-white hover:text-black active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Generate zero-knowledge proof of your solution"
      >
        {proving ? 'Proving...' : `Generate Proof (${useLocalProof ? 'local' : 'remote'})`}
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
