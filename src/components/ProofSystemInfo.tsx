import { PROOF_SYSTEMS } from '../types/proofSystem';

export default function ProofSystemInfo() {
  return (
    <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mt-4">
      <h3 className="font-mono font-bold text-base mb-3 flex items-center gap-2">
        <span>📊</span>
        <span>Proof System Comparison</span>
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left p-2 font-bold">System</th>
              <th className="text-left p-2 font-bold">Setup</th>
              <th className="text-left p-2 font-bold">Proof Size</th>
              <th className="text-left p-2 font-bold">Verify</th>
              <th className="text-left p-2 font-bold">Constraints</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(PROOF_SYSTEMS).map((system, index) => (
              <tr
                key={system.id}
                className={index !== Object.values(PROOF_SYSTEMS).length - 1 ? 'border-b border-gray-300' : ''}
              >
                <td className="p-2">
                  <div className="font-semibold">{system.name}</div>
                </td>
                <td className="p-2">{system.setup}</td>
                <td className="p-2">{system.proofSize}</td>
                <td className="p-2">{system.verifyTime}</td>
                <td className="p-2">{system.constraints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-xs font-mono text-gray-700 bg-gray-50 p-3 border border-gray-300">
        <p className="flex items-start gap-2">
          <span className="flex-shrink-0">⚡</span>
          <span><strong>Best in category:</strong> Groth16 for smallest proofs and fastest verification</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="flex-shrink-0">✅</span>
          <span><strong>No trusted setup:</strong> Noir/UltraHonk requires no ceremony</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="flex-shrink-0">⚠️</span>
          <span><strong>Simplified Circom circuits:</strong> Verify bounds and end position only (not wall collisions). For full security, use Noir.</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="flex-shrink-0">📦</span>
          <span><strong>Lazy loading:</strong> Large Circom files are only downloaded when you generate a proof</span>
        </p>
      </div>
    </div>
  );
}
