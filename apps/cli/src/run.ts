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
 *   --seed <value>     Random seed for reproducibility
 *   --max-ticks <n>    Maximum ticks to run (default: 2000)
 *   --stdout           Output raw JSONL to stdout
 *   --help             Show this help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
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
  p1Script?: string;
  p2Script?: string;
  p1Name: string;
  p2Name: string;
  map: string;
  seed?: string;
  maxTicks: number;
  stdout: boolean;
  help: boolean;
  unknownFlags: string[];
}

/**
 * Parse command line arguments
 */
// Known flags for this command
const KNOWN_FLAGS = ['--p1', '--p2', '--p1-name', '--p2-name', '--map', '--seed', '--max-ticks', '--stdout', '--help', '-h'];

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    map: 'swamp',
    maxTicks: 2000,
    stdout: false,
    help: false,
    unknownFlags: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--p1':
        options.p1Script = nextArg;
        i++;
        break;
      case '--p2':
        options.p2Script = nextArg;
        i++;
        break;
      case '--p1-name':
        options.p1Name = nextArg;
        i++;
        break;
      case '--p2-name':
        options.p2Name = nextArg;
        i++;
        break;
      case '--map':
        options.map = nextArg;
        i++;
        break;
      case '--seed':
        options.seed = nextArg;
        i++;
        break;
      case '--max-ticks':
        options.maxTicks = parseInt(nextArg, 10);
        i++;
        break;
      case '--stdout':
        options.stdout = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-') && !KNOWN_FLAGS.includes(arg)) {
          options.unknownFlags.push(arg);
        }
        break;
    }
  }

  return options;
}

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
  --map <name>       Map to use: swamp, empty (default: swamp)
  --max-ticks <n>    Maximum ticks to run (default: 2000)
  --stdout           Output raw JSONL to stdout (no log files)
  --help             Show this help

Examples:
  skirmish run
  skirmish run --p1 ./bot1.js --p2 ./bot2.js
  skirmish run --p1 ./bot1.js --p2 ./bot2.js --map empty
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
          console.error(`\n[${player.name}] Error at tick ${tick}: ${result.error}`);
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
 * Write logs to local directory
 */
function writeLocalLogs(
  manager: MatchManager,
  terrain: TerrainData,
  seed: number,
  mapName: string
): void {
  const replay = manager.getReplay();
  
  // Write to current directory
  const logDir = process.cwd();
  const timestamp = Date.now();
  
  // Generate raw JSONL log
  const rawLogger = new RawMatchLogger({ mapName });
  const rawLog = rawLogger.generateLog(replay, terrain, seed);
  const rawLogPath = join(logDir, `match_${timestamp}.jsonl`);
  writeFileSync(rawLogPath, rawLog);
  console.log(`Raw log: ${rawLogPath}`);
  
  // Generate text log
  const textLogger = new MatchLogger({ mapName, verbose: false });
  const textLog = textLogger.generateLog(replay, seed);
  const textLogPath = join(logDir, `match_${timestamp}.log`);
  writeFileSync(textLogPath, textLog);
  console.log(`Text log: ${textLogPath}`);
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

  try {
    // Load scripts - use examples if not specified
    const player1Script = options.p1Script 
      ? loadScript(options.p1Script)
      : loadExampleScript('example_1');
    
    const player2Script = options.p2Script
      ? loadScript(options.p2Script)
      : loadExampleScript('example_2');

    // Log what we're doing
    if (!options.stdout) {
      console.log(`Match: ${options.p1Name} vs ${options.p2Name}`);
      console.log(`P1: ${options.p1Script || '(bundled example)'}`);
      console.log(`P2: ${options.p2Script || '(bundled example)'}`);
      console.log(`Map: ${options.map}`);
    }

    // Load map
    const map = loadMap(options.map, getMapsDir());
    const terrain = convertTerrain(map);
    const seed = options.seed ? hashStringToSeed(options.seed) : Math.floor(Math.random() * 0x7FFFFFFF);

    const config: MatchConfig = {
      arenaWidth: DEFAULT_MAP_SIZE,
      arenaHeight: DEFAULT_MAP_SIZE,
      maxTicks: options.maxTicks,
      tickDuration: 1000,
      players: [
        { id: 'player1', name: options.p1Name, slug: 'player1', script: player1Script },
        { id: 'player2', name: options.p2Name, slug: 'player2', script: player2Script }
      ],
      terrain,
      initialObjects: createInitialObjects(map),
      seed
    };

    const manager = new MatchManager(config, undefined);

    if (options.stdout) {
      // Output raw JSONL to stdout
      executeMatch(manager, config, options.maxTicks);
      const logger = new RawMatchLogger({ mapName: options.map });
      const log = logger.generateLog(manager.getReplay(), terrain, seed);
      console.log(log);
    } else {
      // Progress output
      console.log(`Seed: ${seed}`);
      console.log('');
      
      let dotCount = 0;
      executeMatch(manager, config, options.maxTicks, () => {
        process.stdout.write('.');
        if (++dotCount % 100 === 0) process.stdout.write(` [${dotCount}]\n`);
      });
      if (dotCount % 100 !== 0) console.log(` [${dotCount}]`);
      console.log('');

      const victory = manager.getVictory();
      if (victory) {
        const winnerName = victory.winner 
          ? config.players.find(p => p.id === victory.winner)?.name || victory.winner
          : 'DRAW';
        console.log(`Result: ${winnerName} (${victory.reason})`);
      }

      // Write local logs
      writeLocalLogs(manager, terrain, seed, options.map);
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
