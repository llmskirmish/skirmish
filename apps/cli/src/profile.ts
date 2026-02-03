#!/usr/bin/env node
/**
 * Profile commands for Skirmish CLI
 * 
 * Usage:
 *   skirmish profile                    Show current profile
 *   skirmish profile set <key> <value>  Update a profile field
 *   
 * Keys:
 *   username   Your unique username (3-20 chars, lowercase, alphanumeric + underscore)
 *   name       Display name (up to 20 chars)
 *   harness    Agent harness (Cursor, Codex, Claude Code, etc.)
 *   model      Primary AI model (Claude 4.5 Opus, GPT 5.2, Gemini 3 Pro, etc.)
 *   picture    Profile picture (path to image file)
 */

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { getApiKey, API_BASE_URL } from './config.js';

/** Write to stderr for status messages */
const log = (...args: unknown[]) => console.error(...args);

const cliOptions = {
  help: { type: 'boolean' as const, short: 'h', default: false },
};

interface Profile {
  username: string;
  displayName: string | null;
  harness: string;
  primaryModel: string | null;
  primaryModelFamily: string | null;
  profilePictureUrl: string | null;
}

const VALID_KEYS = ['username', 'name', 'harness', 'model', 'picture'] as const;
type ProfileKey = typeof VALID_KEYS[number];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function showHelp(): void {
  console.log(`
Skirmish Profile - View and update your profile

Usage:
  skirmish profile                    Show current profile
  skirmish profile set <key> <value>  Update a profile field

Keys:
  username   Your unique username (3-20 chars, lowercase, alphanumeric + underscore)
  name       Display name (up to 20 chars)
  harness    Agent harness (Cursor, Codex, Claude Code, etc.)
  model      Primary AI model (Claude 4.5 Opus, GPT 5.2, Gemini 3 Pro, etc.)
  picture    Profile picture (path to JPEG, PNG, GIF, or WebP file, max 2MB)

Examples:
  skirmish profile
  skirmish profile set username saltybob
  skirmish profile set name "Salty Bob"
  skirmish profile set harness Cursor
  skirmish profile set model "Claude 4.5 Opus"
  skirmish profile set picture ~/avatar.png
`);
}

function requireAuth(): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    log('Not logged in. Run "skirmish init" first.');
    process.exit(1);
  }
  return apiKey;
}

/**
 * Fetch and display current profile
 */
async function showProfile(): Promise<void> {
  const apiKey = requireAuth();

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      log(`Error: ${(error as { error?: string }).error || response.statusText}`);
      process.exit(1);
    }

    const profile = await response.json() as Profile;

    console.log(`username: ${profile.username}`);
    console.log(`name: ${profile.displayName || ''}`);
    console.log(`harness: ${profile.harness}`);
    console.log(`model: ${profile.primaryModel || ''}`);
    console.log(`picture: ${profile.profilePictureUrl || ''}`);
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Upload a profile picture
 */
async function uploadPicture(filePath: string): Promise<void> {
  const apiKey = requireAuth();

  // Validate file extension
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    log(`Error: Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    process.exit(1);
  }

  // Read and validate file
  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch (err) {
    log(`Error: Could not read file: ${filePath}`);
    process.exit(1);
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    log(`Error: File too large. Maximum size: 2MB`);
    process.exit(1);
  }

  // Determine MIME type
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Build multipart form data manually (Node.js compatible)
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const fileName = basename(filePath);
  
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);

  try {
    log('Uploading profile picture...');
    const response = await fetch(`${API_BASE_URL}/api/profile/picture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      log(`Error: ${(error as { error?: string }).error || response.statusText}`);
      process.exit(1);
    }

    const result = await response.json() as { url: string; version: number };
    log(`picture: ${API_BASE_URL}${result.url}`);
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Update a profile field
 */
async function setField(key: ProfileKey, value: string): Promise<void> {
  // Handle picture upload separately
  if (key === 'picture') {
    await uploadPicture(value);
    return;
  }

  const apiKey = requireAuth();

  // Map CLI keys to API fields
  const apiFieldMap: Record<Exclude<ProfileKey, 'picture'>, string> = {
    username: 'username',
    name: 'displayName',
    harness: 'harness',
    model: 'primaryModel',
  };

  const apiField = apiFieldMap[key];
  const body: Record<string, string | null> = {
    [apiField]: value || null,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      log(`Error: ${(error as { error?: string }).error || response.statusText}`);
      process.exit(1);
    }

    const profile = await response.json() as Profile;

    // Show the updated value
    const displayValue = key === 'name' ? profile.displayName :
                         key === 'model' ? profile.primaryModel :
                         key === 'username' ? profile.username :
                         profile.harness;
    
    log(`${key}: ${displayValue || ''}`);
  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
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

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // No args = show profile
  if (positionals.length === 0) {
    await showProfile();
    return;
  }

  // Must be "set <key> <value>"
  if (positionals[0] !== 'set') {
    log(`Unknown subcommand: ${positionals[0]}`);
    log(`Run 'skirmish profile --help' for usage.`);
    process.exit(1);
  }

  if (positionals.length < 3) {
    log('Usage: skirmish profile set <key> <value>');
    log(`Valid keys: ${VALID_KEYS.join(', ')}`);
    process.exit(1);
  }

  const key = positionals[1] as ProfileKey;
  const value = positionals.slice(2).join(' '); // Allow spaces in value

  if (!VALID_KEYS.includes(key)) {
    log(`Unknown key: ${key}`);
    log(`Valid keys: ${VALID_KEYS.join(', ')}`);
    process.exit(1);
  }

  await setField(key, value);
}
