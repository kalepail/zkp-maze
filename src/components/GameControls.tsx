import { useState } from 'react';

interface GameControlsProps {
  won: boolean;
  proving: boolean;
  autoSolving: boolean;
  onGenerateProof: () => void;
  onAutoSolve: () => void;
  onReset: () => void;
}

export default function GameControls({
  won,
  proving,
  autoSolving,
  onGenerateProof,
  onAutoSolve,
  onReset,
}: GameControlsProps) {
  const [checkingHealth, setCheckingHealth] = useState(false);

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      console.log('Health check response:', data);
      alert(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Health check failed:', error);
      alert('Health check failed: ' + (error as Error).message);
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <div className="flex gap-3 mt-3 flex-wrap">
      <button
        onClick={onGenerateProof}
        disabled={!won || proving || autoSolving}
        className="px-6 py-2 bg-black text-white font-mono border-2 border-black hover:bg-white hover:text-black active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Generate zero-knowledge proof of your solution"
      >
        {proving ? 'Proving...' : 'Generate Proof'}
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
        disabled={autoSolving}
        className="px-6 py-2 bg-white text-black font-mono border-2 border-black hover:bg-black hover:text-white active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Reset the maze to start position"
      >
        Reset
      </button>
      <button
        onClick={handleHealthCheck}
        disabled={checkingHealth}
        className="px-6 py-2 bg-blue-600 text-white font-mono border-2 border-black hover:bg-blue-700 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        aria-label="Check proof service health"
      >
        {checkingHealth ? 'Checking...' : 'Check Health'}
      </button>
    </div>
  );
}
