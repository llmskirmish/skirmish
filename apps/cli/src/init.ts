#!/usr/bin/env node
/**
 * Initialize Skirmish - register with server and create local files
 * 
 * Usage:
 *   skirmish init [directory]
 *   
 * Options:
 *   --force            Overwrite existing credentials (creates new identity)
 *   --help             Show this help
 * 
 * Registers with the server to get an API key, then creates local strategy files.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { parseArgs } from 'node:util';
import { hasCredentials, saveCredentials, getCredentialsPath, API_BASE_URL } from './config.js';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bundled directories
const cliRoot = join(__dirname, '..');
const examplesDir = join(cliRoot, 'example_strategies');
const bundledMapsDir = join(cliRoot, 'maps');

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
  force: { type: 'boolean' as const, short: 'f', default: false },
};

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish Init - Register and create local strategy files

Usage:
  skirmish init [directory]

Options:
  -h, --help         Show this help
  -f, --force        Overwrite existing credentials (creates new identity)

Arguments:
  directory          Target directory for strategies (default: strategies)

Description:
  Registers with llmskirmish.com to create your identity, then creates
  a strategies folder with example bot scripts and a maps folder.
  
  Your API key is saved to ~/.skirmish/credentials.json

Examples:
  skirmish init
  skirmish init ./bots
  skirmish init --force
`);
}

/**
 * Register with the server to get an API key
 */
async function registerWithServer(): Promise<{ username: string; apiKey: string }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { error?: string }).error || `Registration failed: ${response.statusText}`);
  }

  return response.json() as Promise<{ username: string; apiKey: string }>;
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
    log(`Warning: Examples directory not found: ${examplesDir}`);
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
    log(`Warning: Maps directory not found: ${bundledMapsDir}`);
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
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: cliOptions, allowPositionals: true, strict: true });
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Check for existing credentials
  if (hasCredentials() && !values.force) {
    log(`Credentials already exist at ${getCredentialsPath()}`);
    log(`Run with --force to overwrite (this will create a new identity)`);
    process.exit(1);
  }

  // Register with server
  log(`Registering with ${API_BASE_URL}...`);
  
  let username: string;
  let apiKey: string;
  
  try {
    const result = await registerWithServer();
    username = result.username;
    apiKey = result.apiKey;
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Save credentials
  saveCredentials({
    apiKey,
    createdAt: new Date().toISOString(),
  });

  log(`Username: ${username}`);
  log(`API Key: ${apiKey}`);
  log(`Saved to ${getCredentialsPath()}`);
  log('');

  const directory = positionals[0] || 'strategies';
  const targetDir = resolve(directory);

  // Load examples and maps from bundled directories
  const examples = loadExamples();
  const maps = loadMaps();
  
  if (examples.length === 0) {
    log('Warning: No example scripts found, skipping local file creation');
    log('');
    log('Change your username: skirmish profile set --username yourname');
    log(`Or visit: ${API_BASE_URL}/profile`);
    return;
  }

  // Create strategies directory if it doesn't exist
  if (existsSync(targetDir)) {
    log(`${directory}/ already exists`);
  } else {
    mkdirSync(targetDir, { recursive: true });
    log(`Created ${directory}/`);
  }

  // Write example files if they don't exist
  for (const example of examples) {
    const filePath = join(targetDir, example.filename);
    if (existsSync(filePath)) {
      log(`  ${example.filename} already exists, skipping`);
    } else {
      writeFileSync(filePath, example.content);
      const description = extractDescription(example.content);
      log(`  ${example.filename} - ${description}`);
    }
  }

  // Write README if it doesn't exist
  const readmePath = join(targetDir, 'README.md');
  if (existsSync(readmePath)) {
    log(`  README.md already exists, skipping`);
  } else {
    writeFileSync(readmePath, README_CONTENT);
    log(`  README.md - Documentation`);
  }

  // Create maps directory if it doesn't exist
  if (maps.length > 0) {
    const mapsTargetDir = resolve('maps');
    if (existsSync(mapsTargetDir)) {
      log(`maps/ already exists`);
    } else {
      mkdirSync(mapsTargetDir, { recursive: true });
      log(`Created maps/`);
    }

    // Write map files if they don't exist
    for (const map of maps) {
      const filePath = join(mapsTargetDir, map.filename);
      if (existsSync(filePath)) {
        log(`  ${map.filename} already exists, skipping`);
      } else {
        writeFileSync(filePath, map.content);
        try {
          const mapData = JSON.parse(map.content);
          log(`  ${map.filename} - ${mapData.name || 'Map'}`);
        } catch {
          log(`  ${map.filename}`);
        }
      }
    }
  }

  log('');
  log('Get started:');
  log(`  skirmish run --p1 ./${directory}/example_1.js --p2 ./${directory}/example_2.js`);
  log('');
  log('Change your username: skirmish profile set --username yourname');
  log(`Or visit: ${API_BASE_URL}/profile`);
}

main();
