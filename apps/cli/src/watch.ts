#!/usr/bin/env node
/**
 * Watch a match replay in the browser
 * 
 * Usage:
 *   skirmish watch              Watch the most recent match
 *   skirmish watch <id>         Watch match by ID (e.g., skirmish watch 1)
 *   skirmish watch <file>       Watch match from file path
 *   
 * Options:
 *   --help             Show this help
 * 
 * Opens the match in a browser at https://llmskirmish.com/localmatch
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, dirname } from 'path';
import { gzipSync } from 'zlib';
import { exec } from 'child_process';

interface CLIOptions {
  target?: string;
  port?: number;
  help: boolean;
  unknownFlags: string[];
}

// Known flags for this command
const KNOWN_FLAGS = ['--help', '-h', '--port'];

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
    const nextArg = args[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--port') {
      options.port = parseInt(nextArg, 10);
      i++;
    } else if (!arg.startsWith('-') && !options.target) {
      options.target = arg;
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
Skirmish Watch - Watch match replays in the browser

Usage:
  skirmish watch              Watch the most recent match
  skirmish watch <id>         Watch match by ID (e.g., skirmish watch 1)
  skirmish watch <file>       Watch match from file path

Options:
  --help             Show this help

Examples:
  skirmish watch                                    # Watch most recent match
  skirmish watch 1                                  # Watch match ID 1
  skirmish watch match_1_20260130_204850.jsonl      # Watch specific file
  skirmish watch ./log_raw/match_1_20260130.jsonl   # Watch from path
`);
}

interface MatchFile {
  path: string;
  id: number;
  timestamp: string;
  mtime: Date;
}

/**
 * Find all match files in the log_raw directory
 */
function findMatchFiles(logRawDir: string): MatchFile[] {
  if (!existsSync(logRawDir)) {
    return [];
  }

  const files = readdirSync(logRawDir);
  const matches: MatchFile[] = [];

  for (const file of files) {
    // Match pattern: match_{num}_{YYYYMMDD}_{HHMMSS}.jsonl
    const match = file.match(/^match_(\d+)_(\d{8}_\d{6})\.jsonl$/);
    if (match) {
      const filePath = join(logRawDir, file);
      const stat = statSync(filePath);
      matches.push({
        path: filePath,
        id: parseInt(match[1], 10),
        timestamp: match[2],
        mtime: stat.mtime
      });
    }
  }

  // Sort by modification time, newest first
  return matches.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/**
 * Find a match file by target (id, filename, or path)
 */
function findMatchFile(target: string | undefined): string | null {
  const logRawDir = join(process.cwd(), 'log_raw');
  const matches = findMatchFiles(logRawDir);

  // No target = most recent match
  if (!target) {
    if (matches.length === 0) {
      return null;
    }
    return matches[0].path;
  }

  // Check if it's a file path (contains / or \ or ends with .jsonl)
  if (target.includes('/') || target.includes('\\') || target.endsWith('.jsonl')) {
    // Try as absolute path first
    if (existsSync(target)) {
      return resolve(target);
    }
    // Try relative to cwd
    const cwdPath = join(process.cwd(), target);
    if (existsSync(cwdPath)) {
      return cwdPath;
    }
    // Try in log_raw directory
    const logRawPath = join(logRawDir, basename(target));
    if (existsSync(logRawPath)) {
      return logRawPath;
    }
    return null;
  }

  // Check if it's a match ID (number)
  const matchId = parseInt(target, 10);
  if (!isNaN(matchId)) {
    const match = matches.find(m => m.id === matchId);
    if (match) {
      return match.path;
    }
  }

  // Try as a filename in log_raw
  const logRawPath = join(logRawDir, target);
  if (existsSync(logRawPath)) {
    return logRawPath;
  }

  // Try with .jsonl extension
  const withExt = join(logRawDir, `${target}.jsonl`);
  if (existsSync(withExt)) {
    return withExt;
  }

  return null;
}

/**
 * Compress match data for URL encoding
 */
function compressForUrl(jsonlContent: string): string {
  // Gzip compress
  const compressed = gzipSync(jsonlContent, { level: 9 });
  
  // Base64 encode with URL-safe characters
  const base64 = compressed.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return base64;
}

/**
 * Open URL in the default browser
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.log(`Please open manually: ${url}`);
    }
  });
}

/**
 * Watch a match - main export for use by run command
 * @param matchFilePath Path to the JSONL match file
 * @param port Optional port for local development (uses localhost instead of llmskirmish.com)
 */
export function watchMatch(matchFilePath: string, port?: number): void {
  const content = readFileSync(matchFilePath, 'utf-8');
  const encoded = compressForUrl(content);
  
  const baseUrl = port 
    ? `http://localhost:${port}` 
    : 'https://llmskirmish.com';
  const url = `${baseUrl}/localmatch#data=${encoded}`;
  
  console.log(`Opening match: ${basename(matchFilePath)}`);
  console.log(`URL length: ${url.length.toLocaleString()} characters`);
  
  if (url.length > 65536) {
    console.warn(`Warning: URL is ${(url.length / 1024).toFixed(1)}KB - may not work in all browsers`);
  }
  
  openBrowser(url);
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
    const matchPath = findMatchFile(options.target);
    
    if (!matchPath) {
      if (options.target) {
        console.error(`Match not found: ${options.target}`);
        console.error('');
        console.error('Try:');
        console.error('  skirmish watch        # Watch most recent match');
        console.error('  skirmish watch 1      # Watch match ID 1');
      } else {
        console.error('No matches found in log_raw/');
        console.error('');
        console.error('Run a match first:');
        console.error('  skirmish run');
      }
      process.exit(1);
    }

    watchMatch(matchPath, options.port);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * CLI entry point - exported for index.ts to call
 */
export { main as runCli };
