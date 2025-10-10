import express from 'express';
import timeout from 'connect-timeout';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const router = express.Router();
const PORT = 8080;

// Middleware
app.use(express.json({ limit: '50mb' }));

// Timeout middleware - 30 seconds for all requests
app.use(timeout('30s'));

// Halt on timeout helper
function haltOnTimedout(req, res, next) {
  if (!req.timedout) next();
}

app.use(haltOnTimedout);

// Error handler middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Initialize Noir and backend
let noir;
let backend;

async function initializeNoir() {
  try {
    const circuitPath = join(__dirname, 'circuit.json');
    const circuit = JSON.parse(await readFile(circuitPath, 'utf8'));

    noir = new Noir(circuit);
    backend = new UltraHonkBackend(circuit.bytecode, { threads: os.cpus().length });

    console.log('✓ Noir circuit loaded successfully');
  } catch (error) {
    console.error('Failed to initialize Noir circuit:', error.message);
    throw error;
  }
}

// Helper to decode base64 to Buffer
function decodeBase64(base64Str) {
  if (!base64Str) return null;
  return Buffer.from(base64Str, 'base64');
}

// Helper to encode Buffer to base64
function encodeBase64(buffer) {
  if (!buffer) return null;
  return Buffer.from(buffer).toString('base64');
}

// Helper to get performance configuration
function getPerformanceConfig() {
  const cpuCount = os.cpus().length;
  const totalMemory = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  return {
    cpuCores: cpuCount,
    totalMemoryGB: totalMemory,
    sharedArrayBuffer: hasSharedArrayBuffer
  };
}

// Health check endpoint
router.get('/health', (req, res) => {
  const perfConfig = getPerformanceConfig();

  res.json({
    status: 'ok',
    noir: noir ? 'loaded' : 'not loaded',
    backend: backend ? 'loaded' : 'not loaded',
    performance: {
      cpuCores: perfConfig.cpuCores,
      totalMemoryGB: perfConfig.totalMemoryGB,
      sharedArrayBuffer: perfConfig.sharedArrayBuffer ? 'supported' : 'not supported'
    },
    timestamp: new Date().toISOString()
  });
});

// POST /witness - Generate witness from inputs
// Accepts circuit inputs as JSON (e.g., numbers, arrays, strings)
// Example: { maze_seed: "12345", moves: [1, 2, 3, 4] }
router.post('/witness', asyncHandler(async (req, res) => {
  if (!noir) {
    return res.status(503).json({ error: 'Circuit not initialized' });
  }

  const inputs = req.body;

  if (!inputs || typeof inputs !== 'object' || Object.keys(inputs).length === 0) {
    return res.status(400).json({
      error: 'Invalid input: expected circuit inputs as JSON object',
      example: {
        maze_seed: "12345",
        moves: [1, 2, 3, 4, 5]
      }
    });
  }

  try {
    // Execute the circuit to generate the witness
    // Input types are passed directly to Noir (strings for field elements, arrays for arrays, etc.)
    const { witness } = await noir.execute(inputs);

    // Convert witness to base64 for transmission
    const witnessBase64 = encodeBase64(witness);

    res.json({
      success: true,
      witness: witnessBase64
    });
  } catch (error) {
    console.error('Witness generation error:', error);
    res.status(500).json({
      error: 'Witness generation failed',
      message: error.message
    });
  }
}));

// POST /prove - Generate proof from witness
router.post('/prove', asyncHandler(async (req, res) => {
  if (!backend) {
    return res.status(503).json({ error: 'Backend not initialized' });
  }

  const { witness } = req.body;

  if (!witness || typeof witness !== 'string') {
    return res.status(400).json({
      error: 'Invalid input: expected { witness: "<base64 encoded witness>" }'
    });
  }

  try {
    // Decode the witness from base64
    const witnessBuffer = decodeBase64(witness);

    // Generate the proof
    const proof = await backend.generateProof(witnessBuffer);

    // Encode proof components to base64
    const response = {
      success: true,
      proof: encodeBase64(proof.proof),
      publicInputs: proof.publicInputs
    };

    res.json(response);
  } catch (error) {
    console.error('Proof generation error:', error);
    res.status(500).json({
      error: 'Proof generation failed',
      message: error.message
    });
  }
}));

// POST /verify - Verify a proof
router.post('/verify', asyncHandler(async (req, res) => {
  if (!backend) {
    return res.status(503).json({ error: 'Backend not initialized' });
  }

  const { proof, publicInputs } = req.body;

  if (!proof || typeof proof !== 'string') {
    return res.status(400).json({
      error: 'Invalid input: expected { proof: "<base64>", publicInputs: [...] }'
    });
  }

  try {
    // Decode the proof from base64
    const proofBuffer = decodeBase64(proof);

    // Verify the proof
    const isValid = await backend.verifyProof({
      proof: proofBuffer,
      publicInputs: publicInputs || []
    });

    res.json({
      success: true,
      valid: isValid
    });
  } catch (error) {
    console.error('Proof verification error:', error);
    res.status(500).json({
      error: 'Proof verification failed',
      message: error.message
    });
  }
}));

// Mount the router at /api
app.use('/api', router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    availableEndpoints: ['/api/health', '/api/witness', '/api/prove', '/api/verify']
  });
});

// Global error handler
app.use((err, req, res, next) => {
  if (req.timedout) {
    return res.status(408).json({
      error: 'Request timeout',
      message: 'Request exceeded 30 second limit'
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Start server
async function startServer() {
  try {
    // Log system and performance configuration
    const perfConfig = getPerformanceConfig();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚙️  Performance Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   CPU Cores: ${perfConfig.cpuCores}`);
    console.log(`   Total Memory: ${perfConfig.totalMemoryGB} GB`);
    console.log(`   SharedArrayBuffer: ${perfConfig.sharedArrayBuffer ? '✓ supported' : '✗ not supported'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await initializeNoir();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Noir server listening on port ${PORT}`);
      console.log(`   Health: http://0.0.0.0:${PORT}/health`);
      console.log(`   Endpoints: /witness, /prove, /verify`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();
