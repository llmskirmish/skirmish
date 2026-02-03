#!/usr/bin/env node
/**
 * Auth commands for Skirmish CLI
 * 
 * Usage:
 *   skirmish auth <subcommand>
 *   
 * Subcommands:
 *   login    Generate a browser login URL
 *   status   Show current auth state
 *   logout   Remove local credentials
 */

import { parseArgs } from 'node:util';
import { getApiKey, getCredentials, deleteCredentials, getCredentialsPath, API_BASE_URL } from './config.js';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
};

function showHelp(): void {
  console.log(`
Skirmish Auth - Manage authentication

Usage:
  skirmish auth <subcommand>

Subcommands:
  login    Generate a browser login URL
  status   Show current auth state  
  logout   Remove local credentials

Examples:
  skirmish auth login
  skirmish auth status
  skirmish auth logout
`);
}

/**
 * Generate a browser login token
 */
async function login(): Promise<void> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    log('Not logged in. Run "skirmish init" first.');
    process.exit(1);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      log(`Error: ${(error as { error?: string }).error || response.statusText}`);
      process.exit(1);
    }

    const data = await response.json() as { url: string; code: string; expiresAt: string };
    
    log(`Login URL: ${data.url}`);
    log(`Or enter code at ${API_BASE_URL}/login: ${data.code}`);
    log(`Expires in 5 minutes`);
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Show current auth status
 */
async function status(): Promise<void> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    log('Not logged in. Run "skirmish init" to create an identity.');
    process.exit(1);
  }

  // Mask API key for display
  const masked = `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
  
  try {
    // Fetch profile to get username
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const profile = await response.json() as { username: string };
      log(`Username: ${profile.username}`);
    }
  } catch {
    // Ignore fetch errors, just show local info
  }

  log(`API Key: ${masked}`);
  
  const creds = getCredentials();
  if (creds?.createdAt) {
    log(`Created: ${new Date(creds.createdAt).toLocaleDateString()}`);
  }
}

/**
 * Remove local credentials
 */
function logout(): void {
  const deleted = deleteCredentials();
  
  if (deleted) {
    log(`Removed ${getCredentialsPath()}`);
    log(`Your server-side data remains. Run 'skirmish init' to start fresh.`);
  } else {
    log('No credentials found.');
  }
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
  const subcommand = positionals[0];

  if (values.help || !subcommand) {
    showHelp();
    process.exit(0);
  }

  switch (subcommand) {
    case 'login':
      await login();
      break;
    case 'status':
      await status();
      break;
    case 'logout':
      logout();
      break;
    default:
      log(`Unknown subcommand: ${subcommand}`);
      log(`Run 'skirmish auth --help' for usage.`);
      process.exit(1);
  }
}
