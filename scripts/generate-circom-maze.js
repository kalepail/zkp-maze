import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateCircomConfig() {
  // Read Noir maze config to get the actual maze data
  const noirConfigPath = path.join(__dirname, '../circuit/src/maze_config.nr');
  const noirConfig = fs.readFileSync(noirConfigPath, 'utf8');

  // Extract maze seed
  const seedMatch = noirConfig.match(/MAZE_SEED: u32 = (\d+);/);
  if (!seedMatch) {
    throw new Error('Could not find MAZE_SEED in Noir config');
  }
  const mazeSeed = seedMatch[1];

  // Extract maze size
  const sizeMatch = noirConfig.match(/MAZE_SIZE: u8 = (\d+);/);
  if (!sizeMatch) {
    throw new Error('Could not find MAZE_SIZE in Noir config');
  }
  const mazeSize = parseInt(sizeMatch[1]);

  // Extract start and end positions
  const startMatch = noirConfig.match(/START_POS: u8 = (\d+);/);
  const endMatch = noirConfig.match(/END_POS: u8 = (\d+);/);
  if (!startMatch || !endMatch) {
    throw new Error('Could not find START_POS or END_POS in Noir config');
  }
  const startPos = parseInt(startMatch[1]);
  const endPos = parseInt(endMatch[1]);

  // Extract maze array
  const mazeArrayMatch = noirConfig.match(/MAZE: \[\[u8; \d+\]; \d+\] = \[([\s\S]*?)\];/);
  if (!mazeArrayMatch) {
    throw new Error('Could not find MAZE array in Noir config');
  }

  // Parse the maze array
  const mazeArrayStr = mazeArrayMatch[1];
  const rows = mazeArrayStr.trim().split('\n').map(line =>
    line.trim().replace(/^\[|\],?$/g, '').split(',').map(n => parseInt(n.trim()))
  ).filter(row => row.length > 0 && !isNaN(row[0]));

  // Flatten maze array for Circom
  const flatMaze = rows.flat();

  console.log(`📊 Maze info:`);
  console.log(`   Seed: ${mazeSeed}`);
  console.log(`   Size: ${mazeSize}x${mazeSize}`);
  console.log(`   Start: (${startPos}, ${startPos})`);
  console.log(`   End: (${endPos}, ${endPos})`);
  console.log(`   Total cells: ${flatMaze.length}`);

  // Generate Circom configuration file
  let circomCode = `pragma circom 2.0.0;\n\n`;
  circomCode += `// Auto-generated from circuit/src/maze_config.nr\n`;
  circomCode += `// DO NOT EDIT MANUALLY\n`;
  circomCode += `// Seed: ${mazeSeed}\n`;
  circomCode += `// Size: ${mazeSize}x${mazeSize}\n\n`;

  circomCode += `// Get the flattened maze array\n`;
  circomCode += `function getMazeFlat() {\n`;
  circomCode += `    var maze[${flatMaze.length}] = [\n`;

  // Output in groups of 20 for readability
  for (let i = 0; i < flatMaze.length; i += 20) {
    const chunk = flatMaze.slice(i, i + 20);
    circomCode += `        ${chunk.join(', ')}${i + 20 < flatMaze.length ? ',' : ''}\n`;
  }

  circomCode += `    ];\n`;
  circomCode += `    return maze;\n`;
  circomCode += `}\n\n`;

  // Add constants
  circomCode += `// Maze constants\n`;
  circomCode += `function getMazeSeed() { return ${mazeSeed}; }\n`;
  circomCode += `function getMazeSize() { return ${mazeSize}; }\n`;
  circomCode += `function getStartPos() { return ${startPos}; }\n`;
  circomCode += `function getEndPos() { return ${endPos}; }\n`;

  // Write the file
  const outputPath = path.join(__dirname, '../circuit-circom/circuits/maze_config.circom');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, circomCode);

  console.log('✅ Generated circuit-circom/circuits/maze_config.circom');
}

try {
  generateCircomConfig();
} catch (error) {
  console.error('❌ Error generating Circom config:', error.message);
  process.exit(1);
}
