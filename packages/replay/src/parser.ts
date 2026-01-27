/**
 * JSONL Log Parser
 * 
 * Parse raw log files into structured data for replay playback.
 */

import type {
  RawLogMeta,
  RawLogTick,
  RawLogResult,
  RawLogLine,
  ParsedReplayLog,
  ReplayData
} from './log-format.js';

/**
 * Parse a raw JSONL log file into structured data
 * 
 * @param jsonl - The raw JSONL content (newline-delimited JSON)
 * @returns Parsed log with meta, ticks, and optional result
 * @throws Error if meta line is missing or format is invalid
 */
export function parseRawLog(jsonl: string): ParsedReplayLog {
  const lines = jsonl.trim().split('\n');
  
  let meta: RawLogMeta | undefined;
  const ticks: RawLogTick[] = [];
  let result: RawLogResult | undefined;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parsed = JSON.parse(line) as RawLogLine;
    
    switch (parsed.type) {
      case 'meta':
        meta = parsed;
        break;
      case 'tick':
        ticks.push(parsed);
        break;
      case 'result':
        result = parsed;
        break;
    }
  }
  
  if (!meta) {
    throw new Error('Invalid raw log: missing meta line');
  }
  
  return { meta, ticks, result };
}

/**
 * Convert parsed log to ReplayData format for ReplayPlayer
 * 
 * @param parsed - The parsed log from parseRawLog
 * @returns ReplayData ready for ReplayPlayer.load()
 */
export function toReplayData(parsed: ParsedReplayLog): ReplayData {
  return {
    terrain: parsed.meta.terrain,
    playerColors: parsed.meta.playerColors,
    ticks: parsed.ticks.map(t => ({
      tick: t.tick,
      objects: t.objects,
      events: t.events
    }))
  };
}

