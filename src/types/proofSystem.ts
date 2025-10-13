// Proof system type definitions

export type ProofSystemType = 'noir-ultrahonk' | 'circom-groth16' | 'circom-plonk';

export interface ProofSystemInfo {
  id: ProofSystemType;
  name: string;
  description: string;
  proofSize: string;
  verifyTime: string;
  downloadSize: string;
  setup: string;
  constraints: string;
}

export const PROOF_SYSTEMS: Record<ProofSystemType, ProofSystemInfo> = {
  'noir-ultrahonk': {
    id: 'noir-ultrahonk',
    name: 'Noir + UltraHonk',
    description: 'Full maze verification with no trusted setup',
    proofSize: '~15 KB',
    verifyTime: '~200 ms',
    downloadSize: '~3 MB',
    setup: 'None',
    constraints: '~200K',
  },
  'circom-groth16': {
    id: 'circom-groth16',
    name: 'Circom + Groth16',
    description: 'Smallest proofs with per-circuit setup',
    proofSize: '~500 B ⚡',
    verifyTime: '~50 ms ⚡',
    downloadSize: '~8 MB',
    setup: 'Per-circuit',
    constraints: '~17K',
  },
  'circom-plonk': {
    id: 'circom-plonk',
    name: 'Circom + PLONK',
    description: 'Universal setup with small proofs',
    proofSize: '~1 KB',
    verifyTime: '~120 ms',
    downloadSize: '~48 MB',
    setup: 'Universal',
    constraints: '~17K',
  },
};

export const DEFAULT_PROOF_SYSTEM: ProofSystemType = 'noir-ultrahonk';
