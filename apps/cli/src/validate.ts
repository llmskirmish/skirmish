#!/usr/bin/env node
/**
 * Validate a player script by running a test match
 * 
 * Usage:
 *   skirmish validate <script-path>
 *   
 * Options:
 *   --help             Show this help
 * 
 * The script is run against a bundled example for 500 ticks.
 * Returns success if no runtime errors occur, otherwise returns the error.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
  MatchManager,
  MatchRunner,
  loadMap,
  convertTerrain,
  createInitialObjects,
  type MatchConfig,
} from '@skirmish/engine';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to the CLI package
const cliRoot = join(__dirname, '..');

// Maps directory - try local ./maps/ first, then bundled
function getMapsDir(): string {
  const localMaps = join(process.cwd(), 'maps');
  if (existsSync(localMaps)) return localMaps;
  
  return join(cliRoot, 'maps');
}

// Examples directory - bundled with CLI
const examplesDir = join(cliRoot, 'example_strategies');

interface CLIOptions {
  scriptPath?: string;
  help: boolean;
  unknownFlags: string[];
}

interface ValidationResult {
  success: boolean;
  error?: string;
}

// Known flags for this command
const KNOWN_FLAGS = ['--help', '-h'];

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    help: false,
    unknownFlags: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-') && !options.scriptPath) {
      options.scriptPath = arg;
    } else if (arg.startsWith('-') && !KNOWN_FLAGS.includes(arg)) {
      options.unknownFlags.push(arg);
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish Script Validator - Validate player scripts by running a test match

Usage:
  skirmish validate <script-path>

Options:
  --help             Show this help

Description:
  The script is validated by running it in a 500-tick test match against
  a bundled example script. The script under validation plays as player1.

  Returns:
    - Success: "true" if no runtime errors occurred
    - Failure: "false" followed by the JavaScript error message

Examples:
  skirmish validate ./my-strategy.js
  skirmish validate ./bots/aggressive.js
`);
}

/**
 * Load a script file
 */
function loadScript(scriptPath: string): string {
  const resolvedPath = resolve(scriptPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Script file not found: ${resolvedPath}`);
  }
  return readFileSync(resolvedPath, 'utf-8');
}

/**
 * Load the reference opponent script
 */
function loadOpponentScript(): string {
  const scriptPath = join(examplesDir, 'example_1.js');
  if (!existsSync(scriptPath)) {
    throw new Error('Reference opponent script not found');
  }
  return readFileSync(scriptPath, 'utf-8');
}

/**
 * Run a validation match with the script
 */
function runValidationMatch(scriptToValidate: string): ValidationResult {
  const MAX_TICKS = 500;
  const MAP_NAME = 'swamp';
  
  // Load opponent script
  const opponentScript = loadOpponentScript();
  
  // Load map
  const map = loadMap(MAP_NAME, getMapsDir());
  const terrain = convertTerrain(map);
  const seed = 12345; // Fixed seed for reproducibility
  
  const config: MatchConfig = {
    arenaWidth: DEFAULT_MAP_SIZE,
    arenaHeight: DEFAULT_MAP_SIZE,
    maxTicks: MAX_TICKS,
    tickDuration: 1000,
    players: [
      { id: 'player1', name: 'Script Under Test', slug: 'test-script', script: scriptToValidate },
      { id: 'player2', name: 'Opponent', slug: 'opponent', script: opponentScript }
    ],
    terrain,
    initialObjects: createInitialObjects(map),
    seed
  };
  
  const manager = new MatchManager(config, undefined);
  
  // Create persistent runners for each player
  const runners = new Map<string, MatchRunner>();
  for (const player of config.players) {
    if (player.script) {
      runners.set(player.id, new MatchRunner(player.id, player.script));
    }
  }
  
  // Check for script initialization errors
  const player1Runner = runners.get('player1');
  if (player1Runner?.hasInitError()) {
    for (const runner of runners.values()) {
      runner.destroy();
    }
    return {
      success: false,
      error: `Script initialization error: ${player1Runner.getInitError()}`
    };
  }
  
  manager.start();
  
  let tickCount = 0;
  const errors: string[] = [];
  
  while (manager.getStatus() === 'running' && tickCount < MAX_TICKS) {
    for (const player of config.players) {
      const runner = runners.get(player.id);
      if (runner) {
        const driver = manager.getDriver();
        const objects = driver.getObjectsMap();
        const tick = manager.getCurrentTick();
        const terrainData = driver.getRoomTerrain();
        const generateId = () => driver.generateId();
        
        const result = runner.runTick({
          objects,
          tick,
          terrain: terrainData.data,
          generateId
        });
        
        if (result.intents) {
          manager.submitIntents(player.id, result.intents);
        }
        
        // Track errors only for the script under test (player1)
        if (result.error && player.id === 'player1') {
          errors.push(`Tick ${tick}: ${result.error}`);
        }
      }
    }
    
    manager.processTick();
    tickCount++;
  }
  
  // Clean up runners
  for (const runner of runners.values()) {
    runner.destroy();
  }
  
  if (errors.length > 0) {
    return {
      success: false,
      error: errors[0]
    };
  }
  
  return { success: true };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Warn about unknown flags
  for (const flag of options.unknownFlags) {
    console.warn(`Warning: Unknown option '${flag}'`);
  }

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.scriptPath) {
    console.error('Error: Script path is required');
    showHelp();
    process.exit(1);
  }

  try {
    const script = loadScript(options.scriptPath);
    const result = runValidationMatch(script);
    
    if (result.success) {
      console.log('true');
      process.exit(0);
    } else {
      console.log('false');
      console.log(result.error);
      process.exit(1);
    }
  } catch (error) {
    console.log('false');
    console.log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
