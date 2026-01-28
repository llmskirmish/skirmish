#!/usr/bin/env node
/**
 * Skirmish CLI - Run AI battles between scripts
 * 
 * Usage:
 *   skirmish <command> [options]
 *   
 * Commands:
 *   init          Create a strategies folder with example scripts
 *   run           Run a match between two player scripts
 *   validate      Validate a player script syntax by running a test match
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Version injected at build time
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = process.argv[2];
const args = process.argv.slice(3);

// Known global flags
const KNOWN_FLAGS = ['--help', '-h', '--version', '-V'];

/**
 * Warn about unknown flags
 */
function warnUnknownFlags(args: string[], knownFlags: string[]): void {
  for (const arg of args) {
    if (arg.startsWith('-') && !knownFlags.includes(arg)) {
      console.warn(`Warning: Unknown option '${arg}'`);
    }
  }
}

function showHelp(): void {
  console.log(`
Skirmish CLI - Run AI battles between scripts

Usage:
  skirmish <command> [options]

Commands:
  init           Create local folders for /strategies and /maps
  run            Run a match between two player scripts  
  validate       Validate a player script by running a test match

Options:
  --help, -h     Show this help message
  --version, -V  Show version number

Run 'skirmish <command> --help' for command-specific help.

Examples:
  skirmish init
  skirmish run
  skirmish run --p1 ./strategies/example_1.js --p2 ./strategies/example_2.js
  skirmish validate ./my-strategy.js
`);
}

async function main(): Promise<void> {
  if (command === '--version' || command === '-V') {
    console.log(`skirmish v${VERSION}`);
    process.exit(0);
  }

  if (!command || command === '--help' || command === '-h') {
    warnUnknownFlags(args, KNOWN_FLAGS);
    showHelp();
    process.exit(0);
  }

  // Re-inject args for the subcommand
  process.argv = [process.argv[0], process.argv[1], ...args];

  switch (command) {
    case 'init':
      await import('./init.js');
      break;
    case 'run':
      await import('./run.js');
      break;
    case 'validate':
      await import('./validate.js');
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
