#!/usr/bin/env node
/**
 * Initialize a strategies folder with example scripts
 * 
 * Usage:
 *   skirmish init [directory]
 *   
 * Options:
 *   --help             Show this help
 * 
 * Creates a strategies/ folder (or custom directory) with example bot scripts.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bundled directories
const cliRoot = join(__dirname, '..');
const examplesDir = join(cliRoot, 'example_strategies');
const bundledMapsDir = join(cliRoot, 'maps');

interface CLIOptions {
  directory: string;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    directory: 'strategies',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.directory = arg;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish Init - Create a strategies folder with example scripts

Usage:
  skirmish init [directory]

Options:
  --help             Show this help

Arguments:
  directory          Target directory (default: strategies)

Description:
  Creates a strategies folder with example bot scripts and a maps folder.
  
  The examples include:
    - example_1.js   Aggressive melee rush strategy
    - example_2.js   Defensive ranged kiting strategy
  
  The maps include:
    - empty.json     Empty arena
    - swamp.json     Arena with swamp terrain

Examples:
  skirmish init
  skirmish init ./bots
  skirmish init my-strategies
`);
}

/**
 * README template for the strategies folder
 */
const README_CONTENT = `# Skirmish Strategies

This folder contains bot strategies for LLM Skirmish battles.

## Quick Start

\`\`\`bash
# Run a match between two bots
skirmish run --p1 ./example_1.js --p2 ./example_2.js

# Validate your script syntax
skirmish validate ./my-bot.js
\`\`\`

## Writing a Bot

Your bot needs a \`loop()\` function that runs each tick:

\`\`\`javascript
function loop() {
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
  const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
  
  // Your logic here...
}
\`\`\`

## Available Globals

- \`getObjectsByPrototype(Type)\` - Get all objects of a type (Creep, StructureSpawn, etc.)
- \`findClosestByRange(origin, targets)\` - Find closest target
- \`getRange(a, b)\` - Get distance between two objects
- \`getTicks()\` - Get current game tick

## Body Parts

- \`MOVE\` - Enables movement (cost: 50)
- \`ATTACK\` - Melee attack, range 1 (cost: 80)
- \`RANGED_ATTACK\` - Ranged attack, range 3 (cost: 150)
- \`HEAL\` - Heal friendly creeps (cost: 250)
- \`TOUGH\` - Extra HP (cost: 10)
- \`CARRY\` - Carry resources (cost: 50)
- \`WORK\` - Harvest/build/repair (cost: 100)

## Creep Methods

- \`creep.moveTo(target)\` - Move toward a target
- \`creep.attack(target)\` - Melee attack (range 1)
- \`creep.rangedAttack(target)\` - Ranged attack (range 3)
- \`creep.heal(target)\` - Heal a creep

## Spawn Methods

- \`spawn.spawnCreep(body)\` - Spawn a creep with the given body parts

## Tips

1. Balance MOVE parts with other parts for speed
2. More body parts = more expensive but more powerful
3. Spawns have limited energy - manage your economy
4. Use terrain to your advantage (swamps slow movement)
`;

/**
 * Load example scripts from the bundled examples directory
 */
function loadExamples(): Array<{ filename: string; content: string }> {
  const examples: Array<{ filename: string; content: string }> = [];
  
  if (!existsSync(examplesDir)) {
    console.error(`Warning: Examples directory not found: ${examplesDir}`);
    return examples;
  }
  
  const files = readdirSync(examplesDir).filter(f => f.endsWith('.js'));
  
  for (const file of files) {
    const content = readFileSync(join(examplesDir, file), 'utf-8');
    examples.push({ filename: file, content });
  }
  
  return examples;
}

/**
 * Load map files from the bundled maps directory
 */
function loadMaps(): Array<{ filename: string; content: string }> {
  const maps: Array<{ filename: string; content: string }> = [];
  
  if (!existsSync(bundledMapsDir)) {
    console.error(`Warning: Maps directory not found: ${bundledMapsDir}`);
    return maps;
  }
  
  const files = readdirSync(bundledMapsDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const content = readFileSync(join(bundledMapsDir, file), 'utf-8');
    maps.push({ filename: file, content });
  }
  
  return maps;
}

/**
 * Extract description from script's JSDoc comment
 */
function extractDescription(content: string): string {
  const match = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)(?:\s*-|[\n\r])/);
  return match ? match[1].trim() : 'Bot script';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const targetDir = resolve(options.directory);

  // Load examples and maps from bundled directories
  const examples = loadExamples();
  const maps = loadMaps();
  
  if (examples.length === 0) {
    console.error('Error: No example scripts found');
    process.exit(1);
  }

  // Create strategies directory if it doesn't exist
  if (existsSync(targetDir)) {
    console.log(`${options.directory}/ already exists`);
  } else {
    mkdirSync(targetDir, { recursive: true });
    console.log(`Created ${options.directory}/`);
  }

  // Write example files if they don't exist
  for (const example of examples) {
    const filePath = join(targetDir, example.filename);
    if (existsSync(filePath)) {
      console.log(`  ${example.filename} already exists, skipping`);
    } else {
      writeFileSync(filePath, example.content);
      const description = extractDescription(example.content);
      console.log(`  ${example.filename} - ${description}`);
    }
  }

  // Write README if it doesn't exist
  const readmePath = join(targetDir, 'README.md');
  if (existsSync(readmePath)) {
    console.log(`  README.md already exists, skipping`);
  } else {
    writeFileSync(readmePath, README_CONTENT);
    console.log(`  README.md - Documentation`);
  }

  // Create maps directory if it doesn't exist
  if (maps.length > 0) {
    const mapsTargetDir = resolve('maps');
    if (existsSync(mapsTargetDir)) {
      console.log(`maps/ already exists`);
    } else {
      mkdirSync(mapsTargetDir, { recursive: true });
      console.log(`Created maps/`);
    }

    // Write map files if they don't exist
    for (const map of maps) {
      const filePath = join(mapsTargetDir, map.filename);
      if (existsSync(filePath)) {
        console.log(`  ${map.filename} already exists, skipping`);
      } else {
        writeFileSync(filePath, map.content);
        try {
          const mapData = JSON.parse(map.content);
          console.log(`  ${map.filename} - ${mapData.name || 'Map'}`);
        } catch {
          console.log(`  ${map.filename}`);
        }
      }
    }
  }

  console.log('');
  console.log('Get started:');
  console.log(`  skirmish run --p1 ./${options.directory}/example_1.js --p2 ./${options.directory}/example_2.js`);
}

main();
