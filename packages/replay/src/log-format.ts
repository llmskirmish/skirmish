/**
 * JSONL Log Format Types
 * 
 * Format specification:
 * - First line: metadata (config, terrain, playerColors, seed)
 * - Middle lines: tick snapshots (objects, events)
 * - Last line: result (victory) - optional, only if match completed
 */

import type { SerializedGameObject, GameEvent, TerrainData } from './types.js';

// ============================================
// Player Info
// ============================================

/**
 * Player configuration in log
 */
export interface LogPlayerInfo {
  id: string;
  name: string;
  slug?: string;
}

// ============================================
// Meta Line (First Line)
// ============================================

/**
 * Match configuration stored in log
 */
export interface LogMatchConfig {
  arenaWidth: number;
  arenaHeight: number;
  maxTicks: number;
  tickDuration: number;
  players: LogPlayerInfo[];
}

/**
 * Metadata line - first line of JSONL log
 */
export interface RawLogMeta {
  type: 'meta';
  config: LogMatchConfig;
  terrain: TerrainData;
  playerColors: Record<string, number>;
  seed: number;
  mapName?: string;
}

// ============================================
// Tick Line (Middle Lines)
// ============================================

/**
 * Tick line - game state at a specific tick
 */
export interface RawLogTick {
  type: 'tick';
  tick: number;
  objects: SerializedGameObject[];
  events: GameEvent[];
}

// ============================================
// Result Line (Last Line)
// ============================================

/**
 * Victory/match result data
 */
export interface VictoryData {
  winner: string | null;
  reason: string;
  scores: Record<string, number>;
}

/**
 * Result line - last line of JSONL log (if match completed)
 */
export interface RawLogResult {
  type: 'result';
  victory: VictoryData;
}

// ============================================
// Union Type
// ============================================

/**
 * Union of all JSONL line types
 */
export type RawLogLine = RawLogMeta | RawLogTick | RawLogResult;

// ============================================
// Parsed Structure
// ============================================

/**
 * Parsed replay log data
 */
export interface ParsedReplayLog {
  meta: RawLogMeta;
  ticks: RawLogTick[];
  result?: RawLogResult;
}

/**
 * Simplified replay data for ReplayPlayer
 */
export interface ReplayData {
  terrain: TerrainData;
  playerColors: Record<string, number>;
  ticks: Array<{
    tick: number;
    objects: SerializedGameObject[];
    events?: GameEvent[];
  }>;
}

