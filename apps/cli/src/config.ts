/**
 * CLI configuration and credentials management
 * 
 * Credentials stored at ~/.skirmish/credentials.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface Credentials {
  apiKey: string;
  createdAt: string;
}

// Unix: respect XDG_CONFIG_HOME, default to ~/.config/skirmish
// Windows: use ~/.skirmish (no XDG convention)
const SKIRMISH_DIR = process.platform === 'win32'
  ? join(homedir(), '.skirmish')
  : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'skirmish');
const CREDENTIALS_FILE = join(SKIRMISH_DIR, 'credentials.json');

// API base URL - can be overridden with SKIRMISH_API_URL env var
export const API_BASE_URL = process.env.SKIRMISH_API_URL || 'https://llmskirmish.com';

// Server API URL (Cloud Run) - for script submission and match execution
export const SERVER_API_URL = process.env.SKIRMISH_SERVER_URL || 'https://server.llmskirmish.com';

/**
 * Get API key from env var or credentials file
 */
export function getApiKey(): string | null {
  // Priority 1: Environment variable
  if (process.env.SKIRMISH_API_KEY) {
    return process.env.SKIRMISH_API_KEY;
  }

  // Priority 2: Credentials file
  const creds = getCredentials();
  return creds?.apiKey || null;
}

/**
 * Read credentials from file
 */
export function getCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

/**
 * Save credentials to file
 */
export function saveCredentials(creds: Credentials): void {
  // Ensure directory exists
  if (!existsSync(SKIRMISH_DIR)) {
    mkdirSync(SKIRMISH_DIR, { recursive: true });
  }

  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  
  // Set permissions to owner read/write only (0600)
  try {
    chmodSync(CREDENTIALS_FILE, 0o600);
  } catch {
    // Ignore chmod errors on Windows
  }
}

/**
 * Delete credentials file
 */
export function deleteCredentials(): boolean {
  if (!existsSync(CREDENTIALS_FILE)) {
    return false;
  }

  unlinkSync(CREDENTIALS_FILE);
  return true;
}

/**
 * Check if credentials exist
 */
export function hasCredentials(): boolean {
  return existsSync(CREDENTIALS_FILE) || !!process.env.SKIRMISH_API_KEY;
}

/**
 * Get credentials file path (for display)
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
