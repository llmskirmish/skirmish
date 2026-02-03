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
import { parseArgs } from 'node:util';
import {
  MatchManager,
  MatchRunner,
  loadMap,
  convertTerrain,
  createInitialObjects,
  type MatchConfig,
} from '@skirmish/engine';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

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

interface ValidationResult {
  success: boolean;
  error?: string;
}

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
};

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish Script Validator - Validate player scripts by running a test match

Usage:
  skirmish validate <script-path>

Options:
  -h, --help         Show this help

Description:
  The script is validated by running it in a 500-tick test match against
  a bundled example script. The script under validation plays as player1.

  Output (JSON to stdout):
    {"valid": true, "error": null}
    {"valid": false, "error": "..."}

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

export async function run(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args, options: cliOptions, allowPositionals: true, strict: true });
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const scriptPath = positionals[0];

  if (!scriptPath) {
    log('Error: Script path is required');
    showHelp();
    process.exit(1);
  }

  try {
    const script = loadScript(scriptPath);
    const result = runValidationMatch(script);
    
    if (result.success) {
      console.log(JSON.stringify({ valid: true, error: null }));
      process.exit(0);
    } else {
      console.log(JSON.stringify({ valid: false, error: result.error }));
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ valid: false, error: message }));
    process.exit(1);
  }
}
