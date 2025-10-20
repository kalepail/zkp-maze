interface ProofPanelProps {
  proof: string;
  proving: boolean;
}

export default function ProofPanel({ proof, proving }: ProofPanelProps) {
  return (
    <div className="border-2 border-black bg-white flex flex-col h-full">
      <div className="bg-black text-white px-3 py-1 font-mono text-sm border-b-2 border-black flex items-center justify-between">
        <span>Proof</span>
        {proving && (
          <span className="text-xs animate-pulse">Generating...</span>
        )}
      </div>
      <div
        className="p-3 flex-1 overflow-y-auto font-mono text-xs"
        role="region"
        aria-label="Generated proof"
      >
        {proof ? (
          <div className="border-2 border-black p-2 bg-[#f0f0f0] break-all">{proof}</div>
        ) : (
          <p className="text-gray-500">
            {proving ? 'Generating proof...' : 'No proof generated.'}
          </p>
        )}
      </div>
    </div>
  );
}
