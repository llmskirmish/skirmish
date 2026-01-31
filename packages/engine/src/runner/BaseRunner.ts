/**
 * BaseRunner - Abstract base class for script runners
 * 
 * Provides shared host-side logic for both MatchRunner (vm) and IsolatedRunner (isolated-vm):
 * - Object serialization for sandbox consumption
 * - Intent accumulation and handling
 * - State management (objects, terrain, tick)
 * - Error tracking
 */

import type { 
  RuntimeObject, 
  RuntimeCreep, 
  RuntimeSpawn, 
  RuntimeTower, 
  RuntimeSource, 
  RuntimeResource,
  RuntimeConstructionSite,
  UserIntents 
} from '../driver/types.js';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';
import { C } from '@skirmish/types';

/**
 * Tick input data for refreshing game state
 */
export interface TickInput {
  objects: Map<string, RuntimeObject>;
  tick: number;
  terrain: Uint8Array;
  generateId: () => string;
}

/**
 * Result from running a tick
 */
export interface ScriptResult {
  intents: UserIntents;
  console: string[];
  error?: string;
  cpuUsed: number;
}

/**
 * Serialized object format passed to sandbox
 */
export interface SerializedObject {
  id: string;
  type: string;
  x: number;
  y: number;
  user?: string;
  hits?: number;
  hitsMax?: number;
  fatigue?: number;
  body?: Array<{ type: string; hits: number }>;
  spawning?: unknown;
  store?: Record<string, number>;
  cooldown?: number;
  energy?: number;
  amount?: number;
  progress?: number;
  progressTotal?: number;
  structureType?: string;
}

/**
 * Abstract base class for script runners
 */
export abstract class BaseRunner {
  protected playerId: string;
  protected initError: string | null = null;
  
  // Per-tick state
  protected currentObjects: Map<string, RuntimeObject> = new Map();
  protected currentTick: number = 0;
  protected currentTerrain: Uint8Array | null = null;
  protected currentGenerateId: () => string = () => '';
  protected intents: UserIntents = { objects: {} };
  protected consoleOutput: string[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Check if script initialization failed
   */
  hasInitError(): boolean {
    return this.initError !== null;
  }

  /**
   * Get the initialization error message
   */
  getInitError(): string | null {
    return this.initError;
  }

  /**
   * Serialize all current objects for the sandbox
   */
  protected serializeObjects(): string {
    const objects: SerializedObject[] = [];
    for (const [id, obj] of this.currentObjects) {
      objects.push(this.serializeObject(id, obj));
    }
    return JSON.stringify(objects);
  }

  /**
   * Serialize a single object
   */
  protected serializeObject(id: string, obj: RuntimeObject): SerializedObject {
    const serialized: SerializedObject = {
      id,
      type: obj.type,
      x: obj.x,
      y: obj.y,
      user: (obj as RuntimeCreep).user,
    };

    if (obj.type === 'creep') {
      const creep = obj as RuntimeCreep;
      serialized.hits = creep.hits;
      serialized.hitsMax = creep.hitsMax;
      serialized.fatigue = creep.fatigue;
      serialized.body = creep.body;
      serialized.spawning = creep.spawning;
      serialized.store = creep.store;
    } else if (obj.type === 'spawn') {
      const spawn = obj as RuntimeSpawn;
      serialized.hits = spawn.hits;
      serialized.hitsMax = spawn.hitsMax;
      serialized.store = spawn.store;
      serialized.spawning = spawn.spawning;
    } else if (obj.type === 'tower') {
      const tower = obj as RuntimeTower;
      serialized.hits = tower.hits;
      serialized.hitsMax = tower.hitsMax;
      serialized.cooldown = tower.cooldown;
      serialized.store = tower.store;
    } else if (obj.type === 'source') {
      const source = obj as RuntimeSource;
      serialized.energy = source.energy;
    } else if (obj.type === 'energy' || obj.type === 'resource') {
      const resource = obj as RuntimeResource;
      serialized.amount = resource.amount;
    } else if (obj.type === 'constructionSite') {
      const site = obj as RuntimeConstructionSite;
      serialized.progress = site.progress;
      serialized.progressTotal = site.progressTotal;
      serialized.structureType = site.structureType;
    }

    return serialized;
  }

  /**
   * Get terrain at a position
   */
  protected getTerrainAt(x: number, y: number): number {
    if (!this.currentTerrain) return C.TERRAIN_PLAIN;
    const arenaSize = DEFAULT_MAP_SIZE;
    if (x < 0 || x >= arenaSize || y < 0 || y >= arenaSize) return C.TERRAIN_WALL;
    return this.currentTerrain[y * arenaSize + x] || C.TERRAIN_PLAIN;
  }

  /**
   * Add an intent from the sandbox
   */
  protected addIntent(objectId: string, intentType: string, intentData: Record<string, unknown>): void {
    if (!this.intents.objects[objectId]) {
      this.intents.objects[objectId] = {};
    }
    (this.intents.objects[objectId] as Record<string, unknown>)[intentType] = intentData;
  }

  /**
   * Reset per-tick state
   */
  protected resetTickState(): void {
    this.intents = { objects: {} };
    this.consoleOutput = [];
  }

  /**
   * Update state for a new tick
   */
  protected updateTickState(input: TickInput): void {
    this.currentObjects = input.objects;
    this.currentTick = input.tick;
    this.currentTerrain = input.terrain;
    this.currentGenerateId = input.generateId;
  }

  /**
   * Run a single tick - must be implemented by subclasses
   */
  abstract runTick(input: TickInput): ScriptResult;

  /**
   * Destroy this runner and release resources
   */
  abstract destroy(): void;
}
