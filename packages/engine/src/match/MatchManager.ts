import { PLAYER_COLORS } from '@skirmish/types';
import { ArenaDriver } from '../driver/ArenaDriver.js';
import { ArenaProcessor, type TickResult, type ResultObject } from '../processor/ArenaProcessor.js';
import { RawMatchLogger } from '../logger/RawMatchLogger.js';
import { MatchLogger } from '../logger/MatchLogger.js';
import type { 
  MatchConfig, 
  MatchState, 
  Player, 
  RuntimeObject,
  RuntimeCreep,
  RuntimeSpawn,
  UserIntents,
  GameEvent
} from '../driver/types.js';

/**
 * Storage client interface for optional log uploads.
 * Implement this interface to enable cloud storage of match logs.
 */
export interface StorageUploader {
  /** Upload content to storage with the given key */
  upload(key: string, content: string): Promise<void>;
  /** Get the epoch prefix for storage paths (e.g., "epoch_1/") */
  getEpochPrefix(): string;
}

// ============================================
// VICTORY CONDITION CONFIGURATION
// ============================================

/**
 * Victory condition modes:
 * - 'spawns_only': Player loses when all spawns are destroyed (creeps don't matter)
 * - 'spawns_and_creeps': Player loses when both spawns AND creeps are destroyed
 */
type VictoryConditionMode = 'spawns_only' | 'spawns_and_creeps';

/**
 * Change this constant to switch victory condition behavior:
 * - VICTORY_CONDITION = 'spawns_only'     → Win by destroying enemy spawns
 * - VICTORY_CONDITION = 'spawns_and_creeps' → Win by destroying all enemy units
 */
export const VICTORY_CONDITION: VictoryConditionMode = 'spawns_only';

/**
 * Match status
 */
export type MatchStatus = 'waiting' | 'running' | 'finished';

/**
 * Victory result
 */
export interface VictoryResult {
  winner: string | null; // null for draw
  reason: 'elimination' | 'timeout' | 'surrender';
  scores: Record<string, number>;
}

/**
 * Replay data structure
 */
export interface Replay {
  config: MatchConfig;
  ticks: TickSnapshot[];
  victory?: VictoryResult;
}

/**
 * Snapshot of a single tick for replay
 */
export interface TickSnapshot {
  tick: number;
  objects: ResultObject[];
  events: GameEvent[];
}

/**
 * Logging configuration for automatic log file generation
 */
export interface MatchLoggingOptions {
  /** Whether logging is enabled */
  enabled: boolean;
  /** Match ID for R2 storage path */
  matchId: number;
  /** Map name for log filenames */
  mapName: string;
}

/**
 * Match manager - handles match lifecycle and victory conditions
 */
export class MatchManager {
  private driver: ArenaDriver;
  private processor: ArenaProcessor;
  private config: MatchConfig;
  private status: MatchStatus = 'waiting';
  private tickHistory: TickSnapshot[] = [];
  private victory?: VictoryResult;
  private playerReadyState: Map<string, boolean> = new Map();
  private loggingOptions?: MatchLoggingOptions;
  private uploadPromise: Promise<void> | null = null;
  private storage?: StorageUploader;

  constructor(config: MatchConfig, logging?: MatchLoggingOptions, storage?: StorageUploader) {
    this.config = config;
    this.loggingOptions = logging;
    this.storage = storage;
    this.driver = new ArenaDriver(config);
    this.processor = new ArenaProcessor(this.driver);
    
    // Initialize player ready state
    for (const player of config.players) {
      this.playerReadyState.set(player.id, false);
    }
  }

  /**
   * Get current match status
   */
  getStatus(): MatchStatus {
    return this.status;
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    return this.driver.getGameTime();
  }

  /**
   * Mark a player as ready
   */
  setPlayerReady(playerId: string): void {
    if (this.status !== 'waiting') return;
    
    this.playerReadyState.set(playerId, true);
    
    // Check if all players are ready
    const allReady = Array.from(this.playerReadyState.values()).every(ready => ready);
    if (allReady) {
      this.start();
    }
  }

  /**
   * Start the match
   */
  start(): void {
    if (this.status !== 'waiting') return;
    
    this.status = 'running';
    
    // Save initial state
    this.saveTickSnapshot({
      tick: 0,
      events: [],
      objects: Array.from(this.driver.getObjectsMap().values()) as ResultObject[]
    });
  }

  /**
   * Submit intents for a player
   */
  submitIntents(playerId: string, intents: UserIntents): void {
    if (this.status !== 'running') return;
    
    // Validate player exists
    const player = this.driver.getPlayer(playerId);
    if (!player) return;
    
    this.driver.saveUserIntents(playerId, intents);
  }

  /**
   * Process a single tick
   */
  processTick(): TickResult | null {
    if (this.status !== 'running') return null;
    
    // Check victory before processing
    const preVictory = this.checkVictory();
    if (preVictory) {
      this.finishMatch(preVictory);
      return null;
    }
    
    // Process tick
    const result = this.processor.processTick();
    
    // Save to history
    this.saveTickSnapshot(result);
    
    // Check victory after processing
    const postVictory = this.checkVictory();
    if (postVictory) {
      this.finishMatch(postVictory);
    }
    
    return result;
  }

  /**
   * Run the match until completion
   */
  runToCompletion(onTick?: (result: TickResult) => void): VictoryResult {
    this.start();
    
    while (this.status === 'running') {
      const result = this.processTick();
      if (result && onTick) {
        onTick(result);
      }
    }
    
    return this.victory!;
  }

  /**
   * Check victory conditions
   */
  checkVictory(): VictoryResult | null {
    // Check timeout
    if (this.driver.isMatchExpired()) {
      return this.calculateTimeoutVictory();
    }
    
    // Check elimination (all creeps/spawns destroyed)
    const elimination = this.checkElimination();
    if (elimination) {
      return elimination;
    }
    
    return null;
  }

  /**
   * Check if any player has been eliminated
   */
  private checkElimination(): VictoryResult | null {
    const players = this.driver.getPlayers();
    const playerScores: Record<string, number> = {};
    const alivePlayers: string[] = [];
    
    for (const player of players) {
      const objects = this.driver.getObjectsByUser(player.id);
      
      // Count units
      const creeps = objects.filter(o => o.type === 'creep' && !(o as RuntimeCreep).spawning);
      const spawns = objects.filter(o => o.type === 'spawn');
      
      // Check if player is alive based on victory condition mode
      let isAlive: boolean;
      if (VICTORY_CONDITION === 'spawns_only') {
        // Player is alive only if they have spawns
        isAlive = spawns.length > 0;
      } else {
        // Player is alive if they have any non-spawning creeps OR any spawns
        isAlive = creeps.length > 0 || spawns.length > 0;
      }
      
      // Score based on remaining units
      playerScores[player.id] = creeps.length * 100 + spawns.length * 500;
      
      if (isAlive) {
        alivePlayers.push(player.id);
      }
    }
    
    // If only one player remains, they win
    if (alivePlayers.length === 1) {
      return {
        winner: alivePlayers[0],
        reason: 'elimination',
        scores: playerScores
      };
    }
    
    // If no players remain, it's a draw
    if (alivePlayers.length === 0) {
      return {
        winner: null,
        reason: 'elimination',
        scores: playerScores
      };
    }
    
    return null;
  }

  /**
   * Calculate victory on timeout
   */
  private calculateTimeoutVictory(): VictoryResult {
    const players = this.driver.getPlayers();
    const playerScores: Record<string, number> = {};
    let highestScore = -1;
    let winner: string | null = null;
    let tie = false;
    
    for (const player of players) {
      const objects = this.driver.getObjectsByUser(player.id);
      
      // Calculate score
      let score = 0;
      for (const obj of objects) {
        if (obj.type === 'creep') {
          const creep = obj as RuntimeCreep;
          score += creep.hits; // Remaining health
        }
        if (obj.type === 'spawn') {
          const spawn = obj as RuntimeSpawn;
          score += 1000; // Spawns are valuable
        }
      }
      
      playerScores[player.id] = score;
      
      if (score > highestScore) {
        highestScore = score;
        winner = player.id;
        tie = false;
      } else if (score === highestScore) {
        tie = true;
      }
    }
    
    return {
      winner: tie ? null : winner,
      reason: 'timeout',
      scores: playerScores
    };
  }

  /**
   * Save tick snapshot for replay
   */
  private saveTickSnapshot(result: TickResult): void {
    this.tickHistory.push({
      tick: result.tick,
      objects: result.objects.map(obj => JSON.parse(JSON.stringify(obj)) as ResultObject),
      events: JSON.parse(JSON.stringify(result.events))
    });
  }

  /**
   * Get replay data
   */
  getReplay(): Replay {
    return {
      config: this.config,
      ticks: this.tickHistory,
      victory: this.victory
    };
  }

  /**
   * Get current state snapshot
   */
  getStateSnapshot(): MatchState {
    return this.driver.getStateSnapshot();
  }

  /**
   * Get the driver (for advanced usage)
   */
  getDriver(): ArenaDriver {
    return this.driver;
  }

  /**
   * Get victory result (if finished)
   */
  getVictory(): VictoryResult | undefined {
    return this.victory;
  }

  /**
   * Finish the match with the given victory result
   * Sets status to finished and writes logs if enabled
   */
  private finishMatch(victoryResult: VictoryResult): void {
    this.victory = victoryResult;
    this.status = 'finished';
    this.writeLogsIfEnabled();
  }

  /**
   * Write log files if logging is enabled (uploads to R2)
   */
  private writeLogsIfEnabled(): void {
    if (!this.loggingOptions?.enabled) return;
    
    // Start upload and track the promise
    this.uploadPromise = this.uploadLogsToR2().catch(err => {
      console.error('Failed to upload logs to R2:', err);
    });
  }

  /**
   * Wait for any pending log uploads to complete.
   * Call this before process exit to ensure logs are uploaded.
   */
  async waitForUploads(): Promise<void> {
    if (this.uploadPromise) {
      await this.uploadPromise;
    }
  }

  /**
   * Upload logs to cloud storage (requires storage adapter)
   */
  private async uploadLogsToR2(): Promise<void> {
    if (!this.loggingOptions?.enabled || !this.storage) return;
    
    const { matchId, mapName } = this.loggingOptions;
    const seed = this.driver.getSeed();
    const terrain = this.driver.getRoomTerrain();
    const replay = this.getReplay();
    
    // Generate timestamp for filename (YYMMDD-HHMMSS)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${yy}${mm}${dd}-${hh}${min}${ss}`;
    
    // Generate raw JSONL log
    const epochPrefix = this.storage.getEpochPrefix();
    const rawLogger = new RawMatchLogger({ mapName });
    const rawLog = rawLogger.generateLog(replay, terrain, seed);
    const rawLogKey = `${epochPrefix}matches/${matchId}/raw_log_${timestamp}.jsonl`;
    
    // Generate text log
    const textLogger = new MatchLogger({ mapName, verbose: false });
    const textLog = textLogger.generateLog(replay, seed);
    const textLogKey = `${epochPrefix}matches/${matchId}/log_${timestamp}.log`;
    
    // Upload to storage
    await this.storage.upload(rawLogKey, rawLog);
    console.log(`Uploaded: ${rawLogKey}`);
    
    await this.storage.upload(textLogKey, textLog);
    console.log(`Uploaded: ${textLogKey}`);
  }

  /**
   * Surrender a player
   */
  surrender(playerId: string): void {
    if (this.status !== 'running') return;
    
    const players = this.driver.getPlayers().filter(p => p.id !== playerId);
    
    if (players.length === 1) {
      this.finishMatch({
        winner: players[0].id,
        reason: 'surrender',
        scores: {}
      });
    }
  }
}

