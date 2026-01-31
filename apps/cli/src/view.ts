#!/usr/bin/env node
/**
 * View a match replay in the browser
 * 
 * Usage:
 *   skirmish view              View the most recent match
 *   skirmish view <id>         View match by ID (e.g., skirmish view 1)
 *   skirmish view <file>       View match from file path
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
import { parseArgs } from 'node:util';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const cliOptions = {
  port: { type: 'string' as const },
  help: { type: 'boolean' as const, short: 'h', default: false },
};

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Skirmish View - View match replays in the browser

Usage:
  skirmish view              View the most recent match
  skirmish view <id>         View match by ID (e.g., skirmish view 1)
  skirmish view <file>       View match from file path

Options:
  -h, --help         Show this help

Examples:
  skirmish view                                    # View most recent match
  skirmish view 1                                  # View match ID 1
  skirmish view match_1_20260130_204850.jsonl      # View specific file
  skirmish view ./log_raw/match_1_20260130.jsonl   # View from path
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
      log(`Failed to open browser: ${error.message}`);
      log(`Please open manually: ${url}`);
    }
  });
}

export interface ViewMatchOptions {
  /** Port for local development (uses localhost instead of llmskirmish.com) */
  port?: number;
}

/**
 * View a match - main export for use by run command
 * @param matchFilePath Path to the JSONL match file
 * @param options Optional configuration
 */
export function viewMatch(matchFilePath: string, options?: ViewMatchOptions): void {
  const { port } = options ?? {};
  const content = readFileSync(matchFilePath, 'utf-8');
  
  // Extract player names from meta line (first line of JSONL)
  let p1Name: string | undefined;
  let p2Name: string | undefined;
  try {
    const firstLine = content.split('\n')[0];
    const meta = JSON.parse(firstLine);
    if (meta.type === 'meta' && Array.isArray(meta.config?.players)) {
      p1Name = meta.config.players[0]?.name;
      p2Name = meta.config.players[1]?.name;
    }
  } catch {
    // Ignore parse errors, just skip player names
  }
  
  const encoded = compressForUrl(content);
  
  const baseUrl = port 
    ? `http://localhost:${port}` 
    : 'https://llmskirmish.com';
  
  // Build query string with player names
  const params = new URLSearchParams();
  if (p1Name) params.set('p1', p1Name);
  if (p2Name) params.set('p2', p2Name);
  const queryString = params.toString();
  
  const url = `${baseUrl}/localmatch${queryString ? '?' + queryString : ''}#data=${encoded}`;
  
  log(`Opening match: ${basename(matchFilePath)}`);
  log(`URL length: ${url.length.toLocaleString()} characters`);
  
  if (url.length > 65536) {
    log(`Warning: URL is ${(url.length / 1024).toFixed(1)}KB - may not work in all browsers`);
  }
  
  openBrowser(url);
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

  const target = positionals[0];
  const port = values.port ? parseInt(values.port, 10) : undefined;

  try {
    const matchPath = findMatchFile(target);
    
    if (!matchPath) {
      if (target) {
        log(`Match not found: ${target}`);
        log('');
        log('Try:');
        log('  skirmish view        # View most recent match');
        log('  skirmish view 1      # View match ID 1');
      } else {
        log('No matches found in log_raw/');
        log('');
        log('Run a match first:');
        log('  skirmish run');
      }
      process.exit(1);
    }

    viewMatch(matchPath, { port });

  } catch (error) {
    log('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * CLI entry point - exported for index.ts to call
 */
export { main as runCli };
