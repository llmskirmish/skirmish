import { C } from '@skirmish/types';
import type {
  MatchState,
  MatchConfig,
  RuntimeObject,
  RuntimeCreep,
  RuntimeSpawn,
  RuntimeTower,
  RuntimeSource,
  RuntimeResource,
  RuntimeConstructionSite,
  TerrainData,
  Player,
  GameEvent,
  RoomIntents,
  UserIntents,
  BulkOperation
} from './types.js';
import { deepMerge } from '../processor/utils.js';
import { IdGenerator } from './IdGenerator.js';
import { SeededRandom } from './SeededRandom.js';

/**
 * In-memory bulk write implementation
 */
class InMemoryBulkWriter implements BulkOperation {
  private inserts: Map<string, RuntimeObject> = new Map();
  private removes: Set<string> = new Set();
  private objects: Map<string, RuntimeObject>;

  constructor(objects: Map<string, RuntimeObject>) {
    this.objects = objects;
  }

  update(obj: RuntimeObject, updates: Partial<RuntimeObject>): void {
    // Apply update immediately to the in-memory object (like official Screeps)
    // This ensures reads after update see the new values
    deepMerge(obj, updates);
    
    // If this object was inserted this tick, the insert already has the updated data
    // (since we modified the object in-place above)
  }

  insert(obj: RuntimeObject): void {
    this.inserts.set(obj._id, obj);
  }

  remove(id: string): void {
    this.removes.add(id);
  }

  execute(): void {
    // Apply removes first
    for (const id of this.removes) {
      this.objects.delete(id);
      // Also remove from pending inserts if it was inserted then removed same tick
      this.inserts.delete(id);
    }

    // Apply inserts
    for (const [id, obj] of this.inserts) {
      this.objects.set(id, obj);
    }

    // Updates were already applied in-place during update() calls

    // Clear pending operations
    this.inserts.clear();
    this.removes.clear();
  }
}

/**
 * In-memory driver for Arena matches
 * Replaces the MongoDB/Redis-based driver from Screeps World
 */
export class ArenaDriver {
  private state: MatchState;
  private config: MatchConfig;
  private intents: RoomIntents = { users: {} };
  private random: SeededRandom;
  private idGenerator: IdGenerator;
  private actualSeed: number;

  constructor(config: MatchConfig) {
    this.config = config;
    // Use provided seed or generate a random one
    this.actualSeed = config.seed ?? Math.floor(Math.random() * 0x7FFFFFFF);
    this.random = new SeededRandom(this.actualSeed);
    this.idGenerator = new IdGenerator();
    this.state = this.initializeState(config);
  }

  /**
   * Get the seed used for this match (useful for replays)
   * Returns the actual seed, even if one was randomly generated
   */
  getSeed(): number {
    return this.actualSeed;
  }

  /**
   * Get the seeded random generator (for use by processors)
   */
  getRandom(): SeededRandom {
    return this.random;
  }

  private initializeState(config: MatchConfig): MatchState {
    const state: MatchState = {
      tick: 0,
      objects: new Map(),
      terrain: config.terrain ?? this.createDefaultTerrain(config.arenaWidth, config.arenaHeight),
      players: new Map(),
      events: []
    };

    // Add players
    for (const player of config.players) {
      state.players.set(player.id, player);
    }

    // Add initial objects (deep clone to avoid mutating original config)
    if (config.initialObjects) {
      for (const obj of config.initialObjects) {
        // Deep clone the object to avoid mutating the original config
        const clonedObj = JSON.parse(JSON.stringify(obj)) as RuntimeObject;
        state.objects.set(clonedObj._id, clonedObj);
      }
      // Start ID counter after initial objects to avoid collisions
      this.idGenerator.reset(config.initialObjects.length);
    }

    return state;
  }

  private createDefaultTerrain(width: number, height: number): TerrainData {
    const data = new Uint8Array(width * height);
    // Default to all plain terrain (0)
    return { width, height, data };
  }

  /**
   * Generate a unique ID for new objects
   */
  generateId(): string {
    return this.idGenerator.generateId();
  }

  /**
   * Get current game tick
   */
  getGameTime(): number {
    return this.state.tick;
  }

  /**
   * Increment game tick
   */
  incrementGameTime(): void {
    this.state.tick++;
  }

  /**
   * Get all room objects
   */
  getRoomObjects(): { objects: Record<string, RuntimeObject>; users: Record<string, Player> } {
    const objects: Record<string, RuntimeObject> = {};
    for (const [id, obj] of this.state.objects) {
      objects[id] = obj;
    }

    const users: Record<string, Player> = {};
    for (const [id, player] of this.state.players) {
      users[id] = player;
    }

    return { objects, users };
  }

  /**
   * Get objects as a Map
   */
  getObjectsMap(): Map<string, RuntimeObject> {
    return this.state.objects;
  }

  /**
   * Get terrain data
   */
  getRoomTerrain(): TerrainData {
    return this.state.terrain;
  }

  /**
   * Get terrain at a specific position
   */
  getTerrainAt(x: number, y: number): number {
    const { width, data } = this.state.terrain;
    return data[y * width + x];
  }

  /**
   * Set terrain at a specific position
   */
  setTerrainAt(x: number, y: number, terrain: number): void {
    const { width, data } = this.state.terrain;
    data[y * width + x] = terrain;
  }

  /**
   * Create a bulk objects writer
   */
  bulkObjectsWrite(): BulkOperation {
    return new InMemoryBulkWriter(this.state.objects);
  }

  /**
   * Get room intents
   */
  getRoomIntents(): RoomIntents | null {
    if (Object.keys(this.intents.users).length === 0) {
      return null;
    }
    return this.intents;
  }

  /**
   * Save user intents for a tick
   */
  saveUserIntents(userId: string, intents: UserIntents): void {
    this.intents.users[userId] = intents;
  }

  /**
   * Clear all intents for the current tick
   */
  clearRoomIntents(): void {
    this.intents = { users: {} };
  }

  /**
   * Add a game event
   */
  addEvent(event: GameEvent): void {
    this.state.events.push(event);
  }

  /**
   * Get events for current tick
   */
  getEvents(): GameEvent[] {
    return this.state.events;
  }

  /**
   * Clear events for new tick
   */
  clearEvents(): void {
    this.state.events = [];
  }

  /**
   * Get a snapshot of the current state (for replay/visualization)
   */
  getStateSnapshot(): MatchState {
    // Deep clone the state
    const objects = new Map<string, RuntimeObject>();
    for (const [id, obj] of this.state.objects) {
      objects.set(id, { ...obj } as RuntimeObject);
    }

    return {
      tick: this.state.tick,
      objects,
      terrain: this.state.terrain,
      players: new Map(this.state.players),
      events: [...this.state.events]
    };
  }

  /**
   * Get constants (Arena-specific values)
   */
  get constants(): typeof C {
    return C;
  }

  /**
   * Get player by ID
   */
  getPlayer(id: string): Player | undefined {
    return this.state.players.get(id);
  }

  /**
   * Get all players
   */
  getPlayers(): Player[] {
    return Array.from(this.state.players.values());
  }

  /**
   * Get object by ID
   */
  getObject(id: string): RuntimeObject | undefined {
    return this.state.objects.get(id);
  }

  /**
   * Get objects by type
   */
  getObjectsByType<T extends RuntimeObject>(type: string): T[] {
    const result: T[] = [];
    for (const obj of this.state.objects.values()) {
      if (obj.type === type) {
        result.push(obj as T);
      }
    }
    return result;
  }

  /**
   * Get objects owned by a user
   */
  getObjectsByUser(userId: string): RuntimeObject[] {
    const result: RuntimeObject[] = [];
    for (const obj of this.state.objects.values()) {
      if ('user' in obj && obj.user === userId) {
        result.push(obj);
      }
    }
    return result;
  }

  /**
   * Check if position is walkable
   */
  isWalkable(x: number, y: number): boolean {
    const { width, height } = this.state.terrain;
    
    // Out of bounds
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return false;
    }

    // Wall terrain
    const terrain = this.getTerrainAt(x, y);
    if (terrain === C.TERRAIN_WALL) {
      return false;
    }

    // Check for blocking objects
    for (const obj of this.state.objects.values()) {
      if (obj.x === x && obj.y === y) {
        if (C.OBSTACLE_OBJECT_TYPES.includes(obj.type)) {
          return true; // Creeps and spawns are obstacles but we handle collision separately
        }
        if (obj.type === 'constructedWall') {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get arena dimensions
   */
  getArenaDimensions(): { width: number; height: number } {
    return {
      width: this.config.arenaWidth,
      height: this.config.arenaHeight
    };
  }

  /**
   * Get match config
   */
  getConfig(): MatchConfig {
    return this.config;
  }

  /**
   * Check if match should end (max ticks reached)
   */
  isMatchExpired(): boolean {
    return this.state.tick >= this.config.maxTicks;
  }
}

