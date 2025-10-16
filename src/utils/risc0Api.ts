import { RISC0_API_URL } from '../constants/provider';

// Types matching the RISC Zero API server
export interface MazeProof {
  maze_seed: number;
  maze_data: number[];
  journal: number[];
  receipt: number[];
}

export interface PathProof {
  maze_seed: number;
  is_valid: boolean;
  journal: number[];
  receipt: number[];
}

export interface GenerateMazeRequest {
  seed: number;
}

export interface GenerateMazeResponse {
  success: boolean;
  maze_proof?: MazeProof;
  error?: string;
}

export interface VerifyPathRequest {
  maze_proof: MazeProof;
  moves: number[];
}

export interface VerifyPathResponse {
  success: boolean;
  path_proof?: PathProof;
  error?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

/**
 * RISC Zero API Client
 */
export class Risc0ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = RISC0_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if the RISC Zero API server is healthy
   */
  async checkHealth(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Generate a maze proof from a seed
   */
  async generateMaze(seed: number): Promise<MazeProof> {
    const request: GenerateMazeRequest = { seed };

    const response = await fetch(`${this.baseUrl}/api/generate-maze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to generate maze: ${text}`);
    }

    const data: GenerateMazeResponse = await response.json();

    if (!data.success || !data.maze_proof) {
      throw new Error(data.error || 'Failed to generate maze proof');
    }

    return data.maze_proof;
  }

  /**
   * Verify a path through the maze and generate a proof
   */
  async verifyPath(mazeProof: MazeProof, moves: number[]): Promise<PathProof> {
    const request: VerifyPathRequest = {
      maze_proof: mazeProof,
      moves,
    };

    const response = await fetch(`${this.baseUrl}/api/verify-path`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to verify path: ${text}`);
    }

    const data: VerifyPathResponse = await response.json();

    if (!data.success || !data.path_proof) {
      throw new Error(data.error || 'Failed to verify path proof');
    }

    return data.path_proof;
  }

  /**
   * Format a RISC Zero receipt for display
   * Shows a shorthand representation of the nested proof structure
   */
  formatReceipt(receipt: number[]): string {
    // RISC Zero receipts are large, so we show metadata
    const receiptSize = receipt.length;
    const receiptKB = (receiptSize * 4 / 1024).toFixed(2); // u32 array, 4 bytes each

    // Create a compact representation
    const lines = [
      '=== RISC Zero Receipt ===',
      `Size: ${receiptKB} KB (${receiptSize} words)`,
      `Type: SuccinctReceipt (STARK)`,
      '',
      'Structure:',
      '  - InnerReceipt: Composite/Succinct proof',
      '  - Seal: Cryptographic attestation',
      '  - Claim: Pre/post state + journal digest',
      '',
      'Receipt Hash:',
      `  ${this.hashReceipt(receipt)}`,
    ];

    return lines.join('\n');
  }

  /**
   * Format a journal for display
   */
  formatJournal(journal: number[]): string {
    if (journal.length === 0) return '  (empty)';

    // Show first few and last few entries
    const preview = journal.slice(0, 8);
    const suffix = journal.length > 8 ? ` ... (${journal.length} total)` : '';

    return `  [${preview.join(', ')}${suffix}]`;
  }

  /**
   * Create a simple hash representation of the receipt
   */
  private hashReceipt(receipt: number[]): string {
    // Simple hash for display purposes only
    let hash = 0;
    for (let i = 0; i < Math.min(receipt.length, 1000); i++) {
      hash = ((hash << 5) - hash + receipt[i]) | 0;
    }
    const hashStr = Math.abs(hash).toString(16).padStart(16, '0');
    return `0x${hashStr.slice(0, 8)}...${hashStr.slice(-8)}`;
  }
}

// Export singleton instance
export const risc0Api = new Risc0ApiClient();
