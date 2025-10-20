export type ProofProvider = 'noir-local' | 'noir-remote' | 'risc0';

export const RISC0_API_URL = import.meta.env.VITE_RISC0_API_URL || 'https://risc0.stellar.buzz';
