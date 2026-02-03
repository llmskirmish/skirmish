#!/usr/bin/env node
/**
 * Submit a script to the Skirmish ladder
 * 
 * Usage:
 *   skirmish submit <script>
 *   
 * Options:
 *   --help          Show this help
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { parseArgs } from 'node:util';
import { getApiKey, SERVER_API_URL, API_BASE_URL } from './config.js';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
};

function showHelp(): void {
  console.log(`
Skirmish Submit - Upload a script to the community ladder

Usage:
  skirmish submit <script>

Arguments:
  <script>         Path to your JavaScript strategy file

Options:
  -h, --help       Show this help message

Examples:
  skirmish submit ./my-bot.js
  skirmish submit ./strategies/aggressive.js

After submitting, your script will be matched against other players.
Check your ranking at: ${API_BASE_URL}/ladder
`);
}

interface SubmitResponse {
  scriptId: string;
  scriptNumber: number;
}

interface ErrorResponse {
  error: string;
}

interface ProfileResponse {
  username: string;
}

export async function run(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ 
      args, 
      options: cliOptions, 
      allowPositionals: true,
      strict: true 
    });
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Get script path from positional argument
  const scriptPath = positionals[0];
  
  if (!scriptPath) {
    log('Error: Script path is required');
    log('');
    log('Usage: skirmish submit <script>');
    log('Run "skirmish submit --help" for more information.');
    process.exit(1);
  }

  // Check authentication
  const apiKey = getApiKey();
  if (!apiKey) {
    log('Error: Not logged in');
    log('Run "skirmish init" first to create an identity.');
    process.exit(1);
  }

  // Read script file
  const resolvedPath = resolve(scriptPath);
  if (!existsSync(resolvedPath)) {
    log(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  let code: string;
  try {
    code = readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    log(`Error reading file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Basic local syntax check
  try {
    new Function(code);
  } catch (e) {
    log(`Syntax error in ${basename(resolvedPath)}:`);
    log(`  ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  log(`Submitting ${basename(resolvedPath)}...`);

  try {
    const response = await fetch(`${SERVER_API_URL}/scripts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText })) as ErrorResponse;
      log(`Error: ${errorData.error}`);
      process.exit(1);
    }

    const data = await response.json() as SubmitResponse;
    
    // Fetch profile to get username for the URL
    let username = '';
    try {
      const profileResponse = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json() as ProfileResponse;
        username = profile.username;
      }
    } catch {
      // Ignore profile fetch errors
    }
    
    log('');
    log(`Script submitted successfully!`);
    log(`  Script #${data.scriptNumber}`);
    log(`  ID: ${data.scriptId}`);
    log('');
    log('Your script will be matched against other players automatically.');
    log(`Check your ranking: ${API_BASE_URL}/u/${username}`);

  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      log('Error: Could not connect to server');
      log(`  URL: ${SERVER_API_URL}`);
      log('  Check your internet connection and try again.');
    } else {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}
