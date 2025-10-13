import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

async function setupAll() {
  console.log('🔐 Setting up all Circom proof systems...\n');

  const ptauFile = path.join(__dirname, '../circuit-circom/ptau/powersOfTau28_hez_final_16.ptau');
  const r1csFile = path.join(__dirname, '../circuit-circom/build/maze.r1cs');

  // Check files exist
  if (!fs.existsSync(ptauFile)) {
    console.error('❌ Powers of Tau file not found. Downloading...');
    const ptauDir = path.dirname(ptauFile);
    fs.mkdirSync(ptauDir, { recursive: true });

    console.log('📥 Downloading powersOfTau28_hez_final_16.ptau (~72MB)...');
    await execAsync(
      `curl -L -o "${ptauFile}" "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );
    console.log('✅ Downloaded Powers of Tau file\n');
  }

  if (!fs.existsSync(r1csFile)) {
    console.error('❌ R1CS file not found. Please compile circuit first:');
    console.error('   npm run compile:circom\n');
    process.exit(1);
  }

  // Create output directories
  const groth16Dir = path.join(__dirname, '../circuit-circom/build/groth16');
  const plonkDir = path.join(__dirname, '../circuit-circom/build/plonk');
  const fflonkDir = path.join(__dirname, '../circuit-circom/build/fflonk');

  fs.mkdirSync(groth16Dir, { recursive: true });
  fs.mkdirSync(plonkDir, { recursive: true });
  fs.mkdirSync(fflonkDir, { recursive: true });

  // === GROTH16 SETUP ===
  console.log('📦 Setting up Groth16...');
  console.log('   This may take 30-60 seconds...');

  try {
    // Initial setup
    await execAsync(
      `npx snarkjs groth16 setup "${r1csFile}" "${ptauFile}" "${groth16Dir}/maze_0000.zkey"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    // Contribute randomness
    console.log('   🎲 Contributing randomness...');
    const randomness = Math.random().toString() + Date.now().toString();
    await execAsync(
      `echo "${randomness}" | npx snarkjs zkey contribute "${groth16Dir}/maze_0000.zkey" "${groth16Dir}/maze_final.zkey" --name="Maze Challenge" -v`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    // Export verification key
    await execAsync(
      `npx snarkjs zkey export verificationkey "${groth16Dir}/maze_final.zkey" "${groth16Dir}/verification_key.json"`
    );

    // Clean up intermediate file
    fs.unlinkSync(`${groth16Dir}/maze_0000.zkey`);

    console.log('✅ Groth16 setup complete\n');
  } catch (error) {
    console.error('❌ Groth16 setup failed:', error.message);
    process.exit(1);
  }

  // === PLONK SETUP ===
  console.log('📦 Setting up PLONK...');
  console.log('   This may take 30-60 seconds...');

  try {
    await execAsync(
      `npx snarkjs plonk setup "${r1csFile}" "${ptauFile}" "${plonkDir}/maze_final.zkey"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    await execAsync(
      `npx snarkjs zkey export verificationkey "${plonkDir}/maze_final.zkey" "${plonkDir}/verification_key.json"`
    );

    console.log('✅ PLONK setup complete\n');
  } catch (error) {
    console.error('❌ PLONK setup failed:', error.message);
    process.exit(1);
  }

  // === FFLONK SETUP ===
  console.log('📦 Setting up FFLONK...');
  console.log('   This may take 30-60 seconds...');

  let fflonkSupported = true;
  try {
    await execAsync(
      `npx snarkjs fflonk setup "${r1csFile}" "${ptauFile}" "${fflonkDir}/maze_final.zkey"`,
      { maxBuffer: 100 * 1024 * 1024 }
    );

    await execAsync(
      `npx snarkjs zkey export verificationkey "${fflonkDir}/maze_final.zkey" "${fflonkDir}/verification_key.json"`
    );

    console.log('✅ FFLONK setup complete\n');
  } catch (error) {
    console.warn('⚠️  FFLONK setup failed (may not be supported in this snarkjs version)');
    console.warn('   Continuing with Groth16 and PLONK only...\n');
    fflonkSupported = false;
  }

  // Copy artifacts to public directory
  console.log('📋 Copying artifacts to public directory...');

  const publicGroth16 = path.join(__dirname, '../public/circom/groth16');
  const publicPlonk = path.join(__dirname, '../public/circom/plonk');
  const publicFflonk = path.join(__dirname, '../public/circom/fflonk');

  fs.mkdirSync(publicGroth16, { recursive: true });
  fs.mkdirSync(publicPlonk, { recursive: true });
  fs.mkdirSync(publicFflonk, { recursive: true });

  // Copy WASM (same for all systems)
  const wasmSource = path.join(__dirname, '../circuit-circom/build/maze_js/maze.wasm');
  fs.copyFileSync(wasmSource, path.join(publicGroth16, 'maze.wasm'));
  fs.copyFileSync(wasmSource, path.join(publicPlonk, 'maze.wasm'));
  if (fflonkSupported) {
    fs.copyFileSync(wasmSource, path.join(publicFflonk, 'maze.wasm'));
  }

  // Copy zkeys and vkeys
  const systems = fflonkSupported ? ['groth16', 'plonk', 'fflonk'] : ['groth16', 'plonk'];
  for (const system of systems) {
    const buildDir = path.join(__dirname, `../circuit-circom/build/${system}`);
    const publicDir = path.join(__dirname, `../public/circom/${system}`);

    fs.copyFileSync(
      path.join(buildDir, 'maze_final.zkey'),
      path.join(publicDir, 'maze_final.zkey')
    );
    fs.copyFileSync(
      path.join(buildDir, 'verification_key.json'),
      path.join(publicDir, 'verification_key.json')
    );
  }

  console.log('✅ All artifacts copied\n');

  // Display file sizes
  console.log('📦 File sizes:');
  const wasm = fs.statSync(path.join(publicGroth16, 'maze.wasm'));
  const groth16Zkey = fs.statSync(path.join(publicGroth16, 'maze_final.zkey'));
  const plonkZkey = fs.statSync(path.join(publicPlonk, 'maze_final.zkey'));

  console.log(`   WASM: ${(wasm.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Groth16 zkey: ${(groth16Zkey.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   PLONK zkey: ${(plonkZkey.size / 1024 / 1024).toFixed(2)} MB`);

  let totalSize = wasm.size * 2 + groth16Zkey.size + plonkZkey.size;

  if (fflonkSupported) {
    const fflonkZkey = fs.statSync(path.join(publicFflonk, 'maze_final.zkey'));
    console.log(`   FFLONK zkey: ${(fflonkZkey.size / 1024 / 1024).toFixed(2)} MB`);
    totalSize += wasm.size + fflonkZkey.size;
  }

  console.log(`   Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n🎉 Proof systems ready!');
  const readySystems = fflonkSupported ? 'Groth16, PLONK, and FFLONK' : 'Groth16 and PLONK';
  console.log(`   You can now use ${readySystems} in the browser.`);
}

setupAll().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
