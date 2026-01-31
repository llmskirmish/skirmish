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
 *   view          View a match replay in the browser
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Version injected at build time
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const command = process.argv[2];
const args = process.argv.slice(3);

function showHelpHint(): void {
  log(`Run 'skirmish --help' for usage.`);
}

async function main(): Promise<void> {
  if (command === '--version' || command === '-V') {
    console.log(`skirmish v${VERSION}`);
    process.exit(0);
  }

  if (!command || command === '--help' || command === '-h') {
    // Help goes to stdout when explicitly requested
    console.log(`
Skirmish CLI - Run AI battles between scripts

Usage:
  skirmish <command> [options]

Commands:
  init           Register and create local strategy files
  auth           Manage authentication (login, status, logout)
  run            Run a match between two player scripts  
  validate       Validate a player script by running a test match
  view           View a match replay in the browser

Options:
  -h, --help     Show this help message
  -V, --version  Show version number

Run 'skirmish <command> --help' for command-specific help.

Examples:
  skirmish init
  skirmish run
  skirmish run --p1 ./strategies/example_1.js --p2 ./strategies/example_2.js
  skirmish run --p1 ./bot1.js --p2 ./bot2.js --view
  skirmish validate ./my-strategy.js
  skirmish view
  skirmish view 1
`);
    process.exit(0);
  }

  // Re-inject args for the subcommand
  process.argv = [process.argv[0], process.argv[1], ...args];

  switch (command) {
    case 'init':
      await import('./init.js');
      break;
    case 'auth':
      await import('./auth.js');
      break;
    case 'run':
      await import('./run.js');
      break;
    case 'validate':
      await import('./validate.js');
      break;
    case 'view': {
      const { runCli } = await import('./view.js');
      await runCli();
      break;
    }
    default:
      log(`Unknown command: ${command}`);
      showHelpHint();
      process.exit(1);
  }
}

main().catch(err => {
  log('Error:', err);
  process.exit(1);
});
