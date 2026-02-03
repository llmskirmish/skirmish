#!/usr/bin/env node
/**
 * Run a match between two player scripts
 * 
 * Usage:
 *   Quick start (uses bundled example scripts):
 *     skirmish run
 *   
 *   Custom scripts:
 *     skirmish run --p1 <script> --p2 <script> [options]
 *   
 * Options:
 *   --p1 <path>        Player 1 script
 *   --p2 <path>        Player 2 script
 *   --p1-name <name>   Player 1 name (default: Player 1)
 *   --p2-name <name>   Player 2 name (default: Player 2)
 *   --map <name>       Map to use (default: swamp)
 *   --max-ticks <n>    Maximum ticks to run (default: 2000)
 *   --json             Output raw JSONL to stdout (no log files, no progress)
 *   --view             Open the match in browser after running
 *   --help             Show this help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { parseArgs } from 'node:util';
import {
  MatchManager,
  MatchRunner,
  RawMatchLogger,
  MatchLogger,
  loadMap,
  convertTerrain,
  createInitialObjects,
  type MatchConfig,
  type TerrainData
} from '@skirmish/engine';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';
import { viewMatch } from './view.js';

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

const cliOptions = {
  p1: { type: 'string' as const },
  p2: { type: 'string' as const },
  'p1-name': { type: 'string' as const, default: 'Player 1' },
  'p2-name': { type: 'string' as const, default: 'Player 2' },
  map: { type: 'string' as const, short: 'm', default: 'swamp' },
  seed: { type: 'string' as const },  // undocumented
  'max-ticks': { type: 'string' as const, short: 't', default: '2000' },
  json: { type: 'boolean' as const, default: false },
  view: { type: 'boolean' as const, default: false },
  help: { type: 'boolean' as const, short: 'h', default: false },
};

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish Match Runner - Run battles between AI scripts

Usage:
  Quick start (uses bundled example scripts):
    skirmish run
  
  Custom scripts:
    skirmish run --p1 <script> --p2 <script> [options]

Options:
  --p1 <path>        Player 1 script
  --p2 <path>        Player 2 script
  --p1-name <name>   Player 1 name (default: Player 1)
  --p2-name <name>   Player 2 name (default: Player 2)
  -m, --map <name>   Map to use: swamp, empty (default: swamp)
  -t, --max-ticks    Maximum ticks to run (default: 2000)
  --json             Output raw JSONL to stdout (no log files)
  --view             Open the match in browser after running
  -h, --help         Show this help

Examples:
  skirmish run
  skirmish run --p1 ./bot1.js --p2 ./bot2.js
  skirmish run --p1 ./bot1.js --p2 ./bot2.js -m empty
  skirmish run --view
  skirmish run --p1 ./bot1.js --p2 ./bot2.js --json | jq
`);
}

/**
 * Hash a string to a 32-bit integer seed
 */
function hashStringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0) || 1;
}

/**
 * Load script from file path
 */
function loadScript(scriptPath: string): string {
  const resolvedPath = resolve(scriptPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Script file not found: ${resolvedPath}`);
  }
  return readFileSync(resolvedPath, 'utf-8');
}

/**
 * Load bundled example script
 */
function loadExampleScript(name: string): string {
  const scriptPath = join(examplesDir, `${name}.js`);
  if (!existsSync(scriptPath)) {
    throw new Error(`Example script not found: ${name}`);
  }
  return readFileSync(scriptPath, 'utf-8');
}

/**
 * Execute the match
 */
function executeMatch(
  manager: MatchManager,
  config: MatchConfig,
  maxTicks: number,
  onTick?: () => void
): void {
  // Initialize match runners for each player
  const runners = new Map<string, MatchRunner>();
  for (const player of config.players) {
    if (player.script) {
      const runner = new MatchRunner(player.id, player.script);
      runners.set(player.id, runner);
    }
  }

  manager.start();

  let tickCount = 0;

  while (manager.getStatus() === 'running' && tickCount < maxTicks) {
    for (const player of config.players) {
      const runner = runners.get(player.id);
      if (runner) {
        const driver = manager.getDriver();
        const objects = driver.getObjectsMap();
        const tick = manager.getCurrentTick();
        const terrain = driver.getRoomTerrain();
        const generateId = () => driver.generateId();

        const result = runner.runTick({
          objects,
          tick,
          terrain: terrain.data,
          generateId
        });

        if (result.intents) {
          manager.submitIntents(player.id, result.intents);
        }

        if (result.error) {
          log(`\n[${player.name}] Error at tick ${tick}: ${result.error}`);
        }
      }
    }

    manager.processTick();
    tickCount++;
    onTick?.();
  }

  // Clean up runners
  for (const runner of runners.values()) {
    runner.destroy();
  }
  runners.clear();
}

/**
 * Get the next match number by scanning existing log files
 */
function getNextMatchNumber(logDir: string): number {
  if (!existsSync(logDir)) {
    return 1;
  }
  
  const files = readdirSync(logDir);
  let maxNum = 0;
  
  for (const file of files) {
    // Match pattern: match_{num}_{YYYYMMDD}_{HHMMSS}.log or .jsonl
    const match = file.match(/^match_(\d+)_\d{8}_\d{6}\.(log|jsonl)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }
  
  return maxNum + 1;
}

/**
 * Write logs to local log/ and log_raw/ directories
 * Returns the path to the raw JSONL log file
 */
function writeLocalLogs(
  manager: MatchManager,
  terrain: TerrainData,
  seed: number,
  mapName: string
): string {
  const replay = manager.getReplay();
  
  // Write to log/ and log_raw/ subdirectories
  const logDir = join(process.cwd(), 'log');
  const logRawDir = join(process.cwd(), 'log_raw');
  
  // Ensure directories exist
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  if (!existsSync(logRawDir)) {
    mkdirSync(logRawDir, { recursive: true });
  }
  
  // Get next match number from log_raw
  const matchNum = getNextMatchNumber(logRawDir);
  
  // Format UTC date and time: YYYYMMDD_HHMMSS
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
  const timestamp = `${date}_${time}`;
  
  // Generate raw JSONL log
  const rawLogger = new RawMatchLogger({ mapName });
  const rawLog = rawLogger.generateLog(replay, terrain, seed);
  const rawLogPath = join(logRawDir, `match_${matchNum}_${timestamp}.jsonl`);
  writeFileSync(rawLogPath, rawLog);
  log(`Raw log: ${rawLogPath}`);
  
  // Generate text log
  const textLogger = new MatchLogger({ mapName, verbose: false });
  const textLog = textLogger.generateLog(replay, seed);
  const textLogPath = join(logDir, `match_${matchNum}_${timestamp}.log`);
  writeFileSync(textLogPath, textLog);
  log(`Text log: ${textLogPath}`);
  
  return rawLogPath;
}

export async function run(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args, options: cliOptions, strict: true });
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { values } = parsed;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const p1Script = values.p1;
  const p2Script = values.p2;
  const p1Name = values['p1-name']!;
  const p2Name = values['p2-name']!;
  const mapName = values.map!;
  const seedStr = values.seed;
  const maxTicks = parseInt(values['max-ticks']!, 10);
  const jsonOutput = values.json;
  const openView = values.view;

  try {
    // Load scripts - use examples if not specified
    const player1Script = p1Script 
      ? loadScript(p1Script)
      : loadExampleScript('example_1');
    
    const player2Script = p2Script
      ? loadScript(p2Script)
      : loadExampleScript('example_2');

    // Log what we're doing (to stderr)
    if (!jsonOutput) {
      log(`Match: ${p1Name} vs ${p2Name}`);
      log(`P1: ${p1Script || '(bundled example)'}`);
      log(`P2: ${p2Script || '(bundled example)'}`);
      log(`Map: ${mapName}`);
    }

    // Load map
    const map = loadMap(mapName, getMapsDir());
    const terrain = convertTerrain(map);
    const seed = seedStr ? hashStringToSeed(seedStr) : Math.floor(Math.random() * 0x7FFFFFFF);

    const config: MatchConfig = {
      arenaWidth: DEFAULT_MAP_SIZE,
      arenaHeight: DEFAULT_MAP_SIZE,
      maxTicks: maxTicks,
      tickDuration: 1000,
      players: [
        { id: 'player1', name: p1Name, slug: 'player1', script: player1Script },
        { id: 'player2', name: p2Name, slug: 'player2', script: player2Script }
      ],
      terrain,
      initialObjects: createInitialObjects(map),
      seed
    };

    const manager = new MatchManager(config, undefined);

    if (jsonOutput) {
      // Output raw JSONL to stdout (clean, no progress)
      executeMatch(manager, config, maxTicks);
      const rawLogger = new RawMatchLogger({ mapName });
      const jsonlOutput = rawLogger.generateLog(manager.getReplay(), terrain, seed);
      console.log(jsonlOutput);
    } else {
      // Progress output (to stderr)
      log(`Seed: ${seed}`);
      log('');
      
      let dotCount = 0;
      executeMatch(manager, config, maxTicks, () => {
        process.stderr.write('.');
        if (++dotCount % 100 === 0) process.stderr.write(` [${dotCount}]\n`);
      });
      if (dotCount % 100 !== 0) log(` [${dotCount}]`);
      log('');

      const victory = manager.getVictory();
      if (victory) {
        const winnerName = victory.winner 
          ? config.players.find(p => p.id === victory.winner)?.name || victory.winner
          : 'DRAW';
        log(`Result: ${winnerName} (${victory.reason})`);
      }

      // Write local logs
      const rawLogPath = writeLocalLogs(manager, terrain, seed, mapName);
      
      // Open in browser if --view flag is set
      if (openView) {
        log('');
        viewMatch(rawLogPath);
      }
    }

  } catch (error) {
    log('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
