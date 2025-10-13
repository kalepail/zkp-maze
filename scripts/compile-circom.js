import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

async function compileCircom() {
  console.log('🔧 Compiling Circom circuit...\n');

  try {
    // Check if circom is installed
    try {
      await execAsync('circom --version');
    } catch (error) {
      console.error('❌ Circom compiler not found!');
      console.error('\nPlease install circom:');
      console.error('  Option 1 (Cargo): cargo install --git https://github.com/iden3/circom.git');
      console.error('  Option 2 (Binary): Download from https://github.com/iden3/circom/releases\n');
      process.exit(1);
    }

    const circuitPath = path.join(__dirname, '../circuit-circom/circuits/maze.circom');
    const buildPath = path.join(__dirname, '../circuit-circom/build');

    // Compile circuit with R1CS, WASM, and symbols (with --O2 optimization)
    console.log('Compiling circuit with R1CS, WASM, symbols, and --O2 optimization...');
    const { stdout } = await execAsync(
      `circom "${circuitPath}" --r1cs --wasm --sym --O2 -o "${buildPath}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large outputs
    );

    console.log(stdout);
    console.log('✅ Circuit compiled successfully\n');

    // Get circuit info using snarkjs
    console.log('📊 Checking circuit constraints...');
    const r1csPath = path.join(buildPath, 'maze.r1cs');
    const { stdout: info } = await execAsync(
      `npx snarkjs r1cs info "${r1csPath}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    console.log(info);

    // Check constraint count
    const match = info.match(/# of Constraints: ([\d,]+)/);
    if (match) {
      const constraintsStr = match[1].replace(/,/g, '');
      const constraints = parseInt(constraintsStr);
      const limit = 1048576; // 2^20

      if (constraints > limit) {
        console.warn(`⚠️  Warning: ${constraints.toLocaleString()} constraints exceeds 2^20 limit (${limit.toLocaleString()})!`);
        console.warn('   You will need a larger Powers of Tau file.');
      } else {
        console.log(`✅ ${constraints.toLocaleString()} constraints (within 2^20 limit of ${limit.toLocaleString()})`);
      }
    }

    console.log('\n🎉 Compilation complete!');
    console.log(`   R1CS: ${path.relative(process.cwd(), r1csPath)}`);
    console.log(`   WASM: ${path.relative(process.cwd(), path.join(buildPath, 'maze_js/maze.wasm'))}`);

  } catch (error) {
    console.error('❌ Compilation failed:', error.message);
    if (error.stderr) {
      console.error('\nError details:');
      console.error(error.stderr);
    }
    process.exit(1);
  }
}

compileCircom();
