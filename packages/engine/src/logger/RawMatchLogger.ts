/**
 * RawMatchLogger - Generate JSONL format logs for match replay
 * 
 * Outputs one JSON object per line:
 * - First line: metadata (config, terrain, playerColors, seed)
 * - Middle lines: tick snapshots (objects, events)
 * - Last line: result (victory)
 */

import { PLAYER_COLORS } from '@skirmish/types';
import type { RawLogMeta, RawLogTick, RawLogResult } from '@skirmish/replay';
import type { Replay, TickSnapshot, VictoryResult } from '../match/MatchManager.js';
import type { MatchConfig, TerrainData } from '../driver/types.js';

/**
 * Options for RawMatchLogger
 */
export interface RawMatchLoggerOptions {
  /** Map name to include in metadata */
  mapName?: string;
}

/**
 * RawMatchLogger generates JSONL logs from match replays
 */
export class RawMatchLogger {
  private options: RawMatchLoggerOptions;

  constructor(options: RawMatchLoggerOptions = {}) {
    this.options = options;
  }

  /**
   * Generate complete JSONL log from replay data
   */
  generateLog(replay: Replay, terrain: TerrainData, seed: number): string {
    const lines: string[] = [];

    // Meta line
    const meta = this.createMetaLine(replay.config, terrain, seed);
    lines.push(JSON.stringify(meta));

    // Tick lines
    for (const tick of replay.ticks) {
      const tickLine = this.createTickLine(tick);
      lines.push(JSON.stringify(tickLine));
    }

    // Result line (if match finished)
    if (replay.victory) {
      const result = this.createResultLine(replay.victory);
      lines.push(JSON.stringify(result));
    }

    return lines.join('\n');
  }

  /**
   * Create metadata line
   */
  private createMetaLine(config: MatchConfig, terrain: TerrainData, seed: number): RawLogMeta {
    return {
      type: 'meta',
      config: {
        arenaWidth: config.arenaWidth,
        arenaHeight: config.arenaHeight,
        maxTicks: config.maxTicks,
        tickDuration: config.tickDuration,
        players: config.players.map(p => ({ id: p.id, name: p.name, slug: p.slug }))
      },
      terrain: {
        width: terrain.width,
        height: terrain.height,
        data: Array.from(terrain.data)
      },
      playerColors: { ...PLAYER_COLORS },
      seed,
      mapName: this.options.mapName
    };
  }

  /**
   * Create tick line
   */
  private createTickLine(snapshot: TickSnapshot): RawLogTick {
    return {
      type: 'tick',
      tick: snapshot.tick,
      objects: snapshot.objects,
      events: snapshot.events
    };
  }

  /**
   * Create result line
   */
  private createResultLine(victory: VictoryResult): RawLogResult {
    return {
      type: 'result',
      victory
    };
  }
}


