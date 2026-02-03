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

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Version injected at build time
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
  version: { type: 'boolean' as const, short: 'V', default: false },
};

function showHelp(): void {
  console.log(`
Skirmish CLI - Run AI battles between scripts

Usage:
  skirmish <command> [options]

Commands:
  init           Register and create local strategy files
  auth           Manage authentication (login, status, logout)
  profile        View and update your profile
  submit         Submit a script to the community ladder
  run            Run a match between two player scripts  
  validate       Validate a player script by running a test match
  view           View a match replay in the browser

Options:
  -h, --help     Show this help message
  -V, --version  Show version number

Run 'skirmish <command> --help' for command-specific help.

Examples:
  skirmish init
  skirmish profile
  skirmish profile set harness Cursor
  skirmish submit ./my-bot.js
  skirmish run
  skirmish run --p1 ./strategies/example_1.js --p2 ./strategies/example_2.js
  skirmish run --p1 ./bot1.js --p2 ./bot2.js --view
  skirmish validate ./my-strategy.js
  skirmish view
  skirmish view 1
`);
}

function showHelpHint(): void {
  log(`Run 'skirmish --help' for usage.`);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ 
      args: process.argv.slice(2), 
      options: cliOptions, 
      allowPositionals: true,
      strict: false  // Allow unknown options to pass through to subcommands
    });
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.version) {
    console.log(`skirmish v${VERSION}`);
    process.exit(0);
  }

  // Only show main help if no command provided, or if --help is used without a command
  if (!command) {
    showHelp();
    process.exit(0);
  }

  // Pass args explicitly to subcommands (no global mutation)
  const subcommandArgs = process.argv.slice(3);

  switch (command) {
    case 'init': {
      const { run } = await import('./init.js');
      await run(subcommandArgs);
      break;
    }
    case 'auth': {
      const { run } = await import('./auth.js');
      await run(subcommandArgs);
      break;
    }
    case 'profile': {
      const { run } = await import('./profile.js');
      await run(subcommandArgs);
      break;
    }
    case 'submit': {
      const { run } = await import('./submit.js');
      await run(subcommandArgs);
      break;
    }
    case 'run': {
      const { run } = await import('./run.js');
      await run(subcommandArgs);
      break;
    }
    case 'validate': {
      const { run } = await import('./validate.js');
      await run(subcommandArgs);
      break;
    }
    case 'view': {
      const { run } = await import('./view.js');
      await run(subcommandArgs);
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
