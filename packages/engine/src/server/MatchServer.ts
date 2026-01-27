import { WebSocketServer, WebSocket } from 'ws';
import { PLAYER_1, PLAYER_2, PLAYER_COLORS } from '@skirmish/types';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';
import { MatchManager, type VictoryResult, type Replay, type MatchLoggingOptions, type StorageUploader } from '../match/MatchManager.js';
import { MatchRunner } from '../runner/MatchRunner.js';
import { IdGenerator } from '../driver/IdGenerator.js';
import type { MatchConfig, Player, RuntimeObject } from '../driver/types.js';
import type { TickResult } from '../processor/ArenaProcessor.js';

/**
 * Hash a string to a 32-bit integer seed
 * Uses djb2 algorithm - simple, fast, and produces good distribution
 */
function hashStringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Ensure positive 32-bit integer
  return (hash >>> 0) || 1;
}

/**
 * Server options
 */
export interface MatchServerOptions {
  port?: number;
  host?: string;
  /** Whether to enable cloud logging (requires storage adapter) */
  enableR2Logging?: boolean;
  /** Storage adapter for cloud log uploads */
  storage?: StorageUploader;
}

/**
 * Connected client
 */
interface ConnectedClient {
  ws: WebSocket;
  playerId?: string;
  matchId?: string;
}

/**
 * Map data for terrain and initial objects
 */
interface MapData {
  name: string;
  walls: Array<{ x: number; y: number }>;
  swamps: Array<{ x: number; y: number }>;
  initialObjects: Array<Record<string, unknown>>;
}

/**
 * Extra match options
 */
interface MatchOptions {
  maps?: Record<string, MapData>;
  currentMap?: string;
}

/**
 * Active match
 */
interface ActiveMatch {
  manager: MatchManager;
  clients: Set<ConnectedClient>;
  config: MatchConfig;
  tickInterval?: ReturnType<typeof setInterval>;
  ticksPerSecond: number;
  maps?: Record<string, MapData>;
  currentMap?: string;
  logging?: MatchLoggingOptions;
  /** Match runners per player (Arena-compatible state persistence) */
  runners: Map<string, MatchRunner>;
}

/**
 * WebSocket match server
 * Connects the engine to visualizers and players
 */
export class MatchServer {
  private wss: WebSocketServer | null = null;
  private matches: Map<string, ActiveMatch> = new Map();
  private clients: Set<ConnectedClient> = new Set();
  private options: { port: number; host: string };
  private enableR2Logging: boolean;
  private storage?: StorageUploader;
  private nextMatchId: number = 1;

  constructor(options: MatchServerOptions = {}) {
    this.options = {
      port: options.port ?? 8201,
      host: options.host ?? 'localhost'
    };
    this.enableR2Logging = options.enableR2Logging ?? false;
    this.storage = options.storage;
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.options.port,
          host: this.options.host
        });

        this.wss.on('connection', (ws, req) => {
          this.handleConnection(ws, req.url);
        });

        this.wss.on('listening', () => {
          console.log(`Match server listening on ws://${this.options.host}:${this.options.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          console.error('WebSocket server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    // Stop all matches and clean up runners
    for (const [id, match] of this.matches) {
      if (match.tickInterval) {
        clearInterval(match.tickInterval);
      }
      // Clean up persistent runners
      for (const runner of match.runners.values()) {
        runner.destroy();
      }
      match.runners.clear();
    }
    this.matches.clear();

    // Close all connections
    for (const client of this.clients) {
      client.ws.close();
    }
    this.clients.clear();

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * Create a new match
   */
  createMatch(config: MatchConfig, options?: MatchOptions): string {
    const mapName = options?.currentMap || 'unknown';
    const numericMatchId = this.nextMatchId++;
    
    // Build logging options for R2 if enabled
    const logging: MatchLoggingOptions | undefined = this.enableR2Logging ? {
      enabled: true,
      matchId: numericMatchId,
      mapName
    } : undefined;
    
    const manager = new MatchManager(config, logging, this.storage);
    const matchId = String(numericMatchId);
    
    const activeMatch: ActiveMatch = {
      manager,
      clients: new Set(),
      config,
      ticksPerSecond: 1,
      maps: options?.maps,
      currentMap: options?.currentMap,
      logging,
      runners: new Map()
    };
    
    this.matches.set(matchId, activeMatch);
    
    console.log(`Created match ${matchId} with ${config.players.length} players`);
    
    return matchId;
  }

  /**
   * Start a match
   */
  startMatch(matchId: string, tickInterval = 1000): void {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }

    // Don't start if already running
    if (match.tickInterval) {
      console.log(`Match ${matchId} already running`);
      return;
    }

    // Initialize persistent runners for each player (Arena-compatible)
    for (const player of match.config.players) {
      if (player.script) {
        const runner = new MatchRunner(player.id, player.script);
        match.runners.set(player.id, runner);
      }
    }

    match.manager.start();

    // Send initial state to all clients
    this.broadcastTerrain(matchId);
    this.broadcastColors(matchId);
    this.broadcastState(matchId);

    // Broadcast match start
    this.broadcast(matchId, { type: 'start', data: null });

    // Start tick loop
    match.tickInterval = setInterval(() => {
      this.processTick(matchId);
    }, tickInterval);

    console.log(`Started match ${matchId} with ${tickInterval}ms tick interval`);
  }

  /**
   * Process a tick for a match
   */
  private processTick(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;

    const currentTick = match.manager.getCurrentTick();
    console.log(`Processing tick ${currentTick} for match ${matchId}`);

    // Run player scripts using persistent runners (Arena-compatible state persistence)
    for (const player of match.config.players) {
      const runner = match.runners.get(player.id);
      if (runner) {
        const driver = match.manager.getDriver();
        const objects = driver.getObjectsMap();
        const tick = match.manager.getCurrentTick();
        const terrain = driver.getRoomTerrain();
        const generateId = () => driver.generateId();
        
        const result = runner.runTick({
          objects,
          tick,
          terrain: terrain.data,
          generateId
        });
        
        if (result.intents) {
          match.manager.submitIntents(player.id, result.intents);
        }
        
        // Log any console output
        for (const line of result.console) {
          console.log(`[${player.name}] ${line}`);
        }
        
        if (result.error) {
          console.error(`[${player.name}] Error: ${result.error}`);
        }
      }
    }

    // Process tick
    const tickResult = match.manager.processTick();
    
    if (tickResult) {
      console.log(`Tick ${tickResult.tick} processed, ${tickResult.objects.length} objects`);
      // Broadcast the tick result directly to preserve actionLog data
      this.broadcastTickResult(matchId, tickResult);
    } else {
      console.log(`processTick returned null - match status: ${match.manager.getStatus()}`);
    }

    // Check if match ended
    const victory = match.manager.getVictory();
    if (victory) {
      if (match.tickInterval) {
        clearInterval(match.tickInterval);
        match.tickInterval = undefined;
      }
      
      // Clean up runners
      for (const runner of match.runners.values()) {
        runner.destroy();
      }
      match.runners.clear();
      
      this.broadcast(matchId, { type: 'end', data: victory });
      console.log(`Match ${matchId} ended:`, victory);
    }
  }

  /**
   * Get match replay
   */
  getReplay(matchId: string): Replay | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    
    return match.manager.getReplay();
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, url?: string): void {
    const client: ConnectedClient = { ws };
    this.clients.add(client);

    // Parse URL to get match ID if provided
    if (url) {
      const matchId = url.split('/match/')[1];
        if (matchId) {
          client.matchId = matchId;
          const match = this.matches.get(matchId);
          if (match) {
            match.clients.add(client);
            
            // Send current state
            this.sendTerrain(client, matchId);
            this.sendColors(client, matchId);
            this.sendState(client, matchId);
            this.sendStatus(client, matchId);
          }
        }
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
      if (client.matchId) {
        const match = this.matches.get(client.matchId);
        if (match) {
          match.clients.delete(client);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: ConnectedClient, message: { type: string; data: unknown }): void {
    switch (message.type) {
      case 'join':
        // Join a match
        const { matchId, playerId } = message.data as { matchId: string; playerId?: string };
        client.matchId = matchId;
        client.playerId = playerId;
        
        const match = this.matches.get(matchId);
        if (match) {
          match.clients.add(client);
          this.sendTerrain(client, matchId);
          this.sendColors(client, matchId);
          this.sendState(client, matchId);
        }
        break;

      case 'intents':
        // Submit intents for a player
        if (client.matchId && client.playerId) {
          const m = this.matches.get(client.matchId);
          if (m) {
            m.manager.submitIntents(client.playerId, message.data as any);
          }
        }
        break;

      case 'ready':
        // Mark player as ready
        if (client.matchId && client.playerId) {
          const m = this.matches.get(client.matchId);
          if (m) {
            m.manager.setPlayerReady(client.playerId);
          }
        }
        break;

      case 'start':
        // Start the match
        if (client.matchId) {
          const m = this.matches.get(client.matchId);
          if (m) {
            const ticksPerSecond = m.ticksPerSecond || 1;
            const interval = Math.round(1000 / ticksPerSecond);
            this.startMatch(client.matchId, interval);
            this.broadcastStatus(client.matchId);
          }
        }
        break;

      case 'pause':
        // Pause the match
        if (client.matchId) {
          const m = this.matches.get(client.matchId);
          if (m && m.tickInterval) {
            clearInterval(m.tickInterval);
            m.tickInterval = undefined;
            this.broadcastStatus(client.matchId);
          }
        }
        break;

      case 'tick':
        // Process a single tick
        if (client.matchId) {
          this.processTick(client.matchId);
          this.broadcastStatus(client.matchId);
        }
        break;

      case 'restart':
        // Restart the match (optionally with new map and/or seed)
        if (client.matchId) {
          const m = this.matches.get(client.matchId);
          if (m) {
            // Stop current tick loop
            if (m.tickInterval) {
              clearInterval(m.tickInterval);
              m.tickInterval = undefined;
            }
            
            // Check if a new map or seed was requested
            const restartData = message.data as { map?: string; seed?: string; terrain?: { width: number; height: number; data: number[] } } | null;
            
            // Update seed if provided (accepts any string, hashed to number)
            if (restartData?.seed) {
              m.config.seed = hashStringToSeed(restartData.seed);
              console.log(`Using seed "${restartData.seed}" -> ${m.config.seed}`);
            } else {
              // Generate a new random seed for variety
              m.config.seed = Math.floor(Math.random() * 0x7FFFFFFF);
            }
            
            if (restartData?.map && m.maps && m.maps[restartData.map]) {
              // Load the new map
              const newMap = m.maps[restartData.map];
              m.currentMap = restartData.map;
              
              // Convert map to terrain format
              const TERRAIN_PLAIN = 0;
              const TERRAIN_WALL = 1;
              const TERRAIN_SWAMP = 2;
              const size = DEFAULT_MAP_SIZE;
              const data = new Uint8Array(size * size);
              
              for (const { x, y } of newMap.walls) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                  data[y * size + x] = TERRAIN_WALL;
                }
              }
              
              for (const { x, y } of newMap.swamps) {
                if (x >= 0 && x < size && y >= 0 && y < size && data[y * size + x] === TERRAIN_PLAIN) {
                  data[y * size + x] = TERRAIN_SWAMP;
                }
              }
              
              m.config.terrain = { width: size, height: size, data };
              
              // Convert initial objects from map
              const idGen = new IdGenerator();
              m.config.initialObjects = newMap.initialObjects.map(obj => {
                const _id = idGen.generateId();
                return { ...obj, _id } as RuntimeObject;
              });
              
              console.log(`Switched to map: ${restartData.map}`);
            } else if (restartData?.terrain) {
              // Legacy: raw terrain data was provided
              m.config.terrain = {
                width: restartData.terrain.width,
                height: restartData.terrain.height,
                data: new Uint8Array(restartData.terrain.data)
              };
            }
            
            // Update logging mapName if map changed and logging is enabled
            if (m.logging && m.currentMap) {
              m.logging = { ...m.logging, mapName: m.currentMap };
            }
            
            // Create new manager with (possibly updated) config and logging
            m.manager = new MatchManager(m.config, m.logging, this.storage);
            // Send fresh state
            this.broadcastTerrain(client.matchId);
            this.broadcastColors(client.matchId);
            this.broadcastState(client.matchId);
            this.broadcastStatus(client.matchId);
          }
        }
        break;

      case 'speed':
        // Change tick speed
        if (client.matchId) {
          const m = this.matches.get(client.matchId);
          const { ticksPerSecond } = message.data as { ticksPerSecond: number };
          if (m && ticksPerSecond > 0) {
            m.ticksPerSecond = ticksPerSecond;
            const interval = Math.round(1000 / ticksPerSecond);
            // If running, restart the interval with new speed
            if (m.tickInterval) {
              clearInterval(m.tickInterval);
              m.tickInterval = setInterval(() => {
                this.processTick(client.matchId!);
              }, interval);
            }
            this.broadcastStatus(client.matchId);
          }
        }
        break;
    }
  }

  /**
   * Send message to a client
   */
  private send(client: ConnectedClient, message: { type: string; data: unknown }): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients in a match
   */
  private broadcast(matchId: string, message: { type: string; data: unknown }): void {
    const match = this.matches.get(matchId);
    if (!match) return;

    const data = JSON.stringify(message);
    for (const client of match.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /**
   * Build terrain message data
   */
  private getTerrainMessage(match: ActiveMatch): { type: string; data: unknown } {
    const terrain = match.manager.getDriver().getRoomTerrain();
    return {
      type: 'terrain',
      data: {
        width: terrain.width,
        height: terrain.height,
        data: Array.from(terrain.data)
      }
    };
  }

  /**
   * Build colors message data
   */
  private getColorsMessage(match: ActiveMatch): { type: string; data: unknown } {
    const colors: Record<string, number> = {};
    const players = match.manager.getDriver().getPlayers();
    
    players.forEach((player, index) => {
      if (index === 0) {
        colors[player.id] = PLAYER_COLORS[PLAYER_1];
      } else if (index === 1) {
        colors[player.id] = PLAYER_COLORS[PLAYER_2];
      } else {
        colors[player.id] = PLAYER_COLORS.neutral;
      }
    });
    
    return { type: 'colors', data: colors };
  }

  /**
   * Build state message data
   */
  private getStateMessage(match: ActiveMatch): { type: string; data: unknown } {
    const state = match.manager.getStateSnapshot();
    const objects = Array.from(state.objects.values());
    
    return {
      type: 'state',
      data: {
        tick: state.tick,
        objects
      }
    };
  }

  /**
   * Build status message data
   */
  private getStatusMessage(match: ActiveMatch): { type: string; data: unknown } {
    return {
      type: 'status',
      data: {
        running: !!match.tickInterval,
        ticksPerSecond: match.ticksPerSecond,
        tick: match.manager.getCurrentTick(),
        matchStatus: match.manager.getStatus()
      }
    };
  }

  /**
   * Send or broadcast terrain
   */
  private sendTerrain(client: ConnectedClient, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.send(client, this.getTerrainMessage(match));
  }

  private broadcastTerrain(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.broadcast(matchId, this.getTerrainMessage(match));
  }

  /**
   * Send or broadcast colors
   */
  private sendColors(client: ConnectedClient, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.send(client, this.getColorsMessage(match));
  }

  private broadcastColors(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.broadcast(matchId, this.getColorsMessage(match));
  }

  /**
   * Send or broadcast state
   */
  private sendState(client: ConnectedClient, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.send(client, this.getStateMessage(match));
  }

  private broadcastState(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.broadcast(matchId, this.getStateMessage(match));
  }

  /**
   * Broadcast tick result (includes actionLog for animations)
   */
  private broadcastTickResult(matchId: string, tickResult: TickResult): void {
    const match = this.matches.get(matchId);
    if (!match) return;

    this.broadcast(matchId, {
      type: 'state',
      data: {
        tick: tickResult.tick,
        objects: tickResult.objects,
        events: tickResult.events
      }
    });
  }

  /**
   * Send or broadcast status
   */
  private sendStatus(client: ConnectedClient, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.send(client, this.getStatusMessage(match));
  }

  private broadcastStatus(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.broadcast(matchId, this.getStatusMessage(match));
  }
}

