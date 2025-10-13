// Type declarations for snarkjs
declare module 'snarkjs' {
  export interface Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  export interface PublicSignals extends Array<string | number> {}

  export interface VerificationKey {
    protocol: string;
    curve: string;
    nPublic: number;
    vk_alpha_1?: string[];
    vk_beta_2?: string[][];
    vk_gamma_2?: string[][];
    vk_delta_2?: string[][];
    vk_alphabeta_12?: string[][][];
    IC?: string[][];
    [key: string]: unknown;
  }

  export namespace groth16 {
    export function fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: Proof; publicSignals: PublicSignals }>;

    export function verify(
      vkey: VerificationKey,
      publicSignals: PublicSignals,
      proof: Proof
    ): Promise<boolean>;
  }

  export namespace plonk {
    export function fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: Proof; publicSignals: PublicSignals }>;

    export function verify(
      vkey: VerificationKey,
      publicSignals: PublicSignals,
      proof: Proof
    ): Promise<boolean>;
  }

  export namespace fflonk {
    export function fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: Proof; publicSignals: PublicSignals }>;

    export function verify(
      vkey: VerificationKey,
      publicSignals: PublicSignals,
      proof: Proof
    ): Promise<boolean>;
  }
}
