/**
 * MatchRunner - Screeps Arena compatible persistent script runner
 * 
 * - Uses Node's vm module to create a separate JS context per player
 * - Evaluates player script ONCE at initialization
 * - Calls loop() each tick with refreshed game state
 * - Maintains stable object identity across ticks (same wrapper instance)
 * 
 * This matches Screeps Arena semantics where module/global state persists
 * across ticks within a match.
 * 
 * NOTE: Node vm is NOT a security boundary. Use isolated-vm in production
 * for untrusted code execution.
 */

import * as vm from 'node:vm';
import type { 
  RuntimeObject, 
  RuntimeCreep,
  RuntimeSpawn,
  RuntimeTower,
  RuntimeSource,
  RuntimeResource,
  UserIntents,
  ObjectIntents
} from '../driver/types.js';
import { 
  C, 
  type BodyPartType, 
  type DirectionConstant,
  getDirection as arenaGetDirection,
  getRange as arenaGetRange,
  findClosestByRange as arenaFindClosestByRange,
  findInRange as arenaFindInRange
} from '@skirmish/types';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';
import { CostMatrix, Visual, type PathResult, type ScriptResult } from './MatchStatelessRunner.js';

/**
 * Wrapped game object that maintains stable identity across ticks
 */
interface WrappedObject {
  id: string;
  x: number;
  y: number;
  exists: boolean;
  [key: string]: unknown;
  [key: symbol]: unknown;
}

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
 * Arena-compatible persistent runner with state preservation across ticks
 */
export class MatchRunner {
  private playerId: string;
  private context: vm.Context;
  private script: vm.Script | null = null;
  private loopFn: (() => void) | null = null;
  private scriptSource: string;
  private initError: string | null = null;  // Track initialization errors
  
  // Per-tick state (refreshed each tick)
  private objects: Map<string, RuntimeObject> = new Map();
  private tick: number = 0;
  private terrain: Uint8Array | null = null;
  private generateId: () => string = () => '';
  private intents: UserIntents = { objects: {} };
  private consoleOutput: string[] = [];
  private tickStartTime: number = 0;
  
  // Stable object identity cache: objectId -> wrapped object instance
  private objectCache: Map<string, WrappedObject> = new Map();
  
  // Prototype marker symbols for instanceof-like checks
  private prototypeMarkers = {
    Creep: Symbol('Creep'),
    StructureSpawn: Symbol('StructureSpawn'),
    StructureTower: Symbol('StructureTower'),
    Source: Symbol('Source'),
    Resource: Symbol('Resource'),
    ConstructionSite: Symbol('ConstructionSite'),
  };
  
  constructor(playerId: string, script: string) {
    this.playerId = playerId;
    this.scriptSource = script;
    
    // Create isolated VM context for this player
    this.context = this.createContext();
    
    // Compile and run the script once to define globals/functions
    this.initializeScript();
  }
  
  /**
   * Create the VM context with all Arena API bindings
   */
  private createContext(): vm.Context {
    const self = this;
    
    // Create prototype classes that player code can use with getObjectsByPrototype
    class Creep {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.Creep] === true;
      }
    }
    
    class StructureSpawn {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.StructureSpawn] === true;
      }
    }
    
    class StructureTower {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.StructureTower] === true;
      }
    }
    
    class Source {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.Source] === true;
      }
    }
    
    class Resource {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.Resource] === true;
      }
    }
    
    class ConstructionSite {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return (obj as Record<symbol, unknown>)?.[self.prototypeMarkers.ConstructionSite] === true;
      }
    }
    
    const sandbox = {
      // Prototype classes
      Creep,
      StructureSpawn,
      StructureTower,
      Source,
      Resource,
      ConstructionSite,
      
      // API functions (bound to this runner instance)
      getObjectsByPrototype: <T>(prototype: { new(): T }): T[] => self.getObjectsByPrototype(prototype),
      getObjectById: (id: string) => self.getObjectById(id),
      getObjects: () => self.getObjects(),
      getTicks: () => self.tick,
      getTerrainAt: (pos: { x: number; y: number }) => self.getTerrainAt(pos),
      getRange: arenaGetRange,
      getDirection: arenaGetDirection,
      getCpuTime: () => performance.now() - self.tickStartTime,
      findClosestByRange: arenaFindClosestByRange,
      findInRange: arenaFindInRange,
      findClosestByPath: <T extends { x: number; y: number }>(
        pos: { x: number; y: number },
        objects: T[],
        opts?: { range?: number; costMatrix?: CostMatrix }
      ): T | null => self.findClosestByPath(pos, objects, opts),
      findPath: (
        from: { x: number; y: number },
        to: { x: number; y: number },
        opts?: { costMatrix?: CostMatrix; range?: number }
      ) => self.findPath(from, to, opts),
      searchPath: (
        origin: { x: number; y: number },
        goal: { pos: { x: number; y: number }; range?: number } | Array<{ pos: { x: number; y: number }; range?: number }>,
        opts?: { costMatrix?: CostMatrix }
      ): PathResult => self.searchPath(origin, goal, opts),
      createConstructionSite: (pos: { x: number; y: number }, structureType: string) => 
        self.createConstructionSite(pos, structureType),
      
      // Classes
      CostMatrix,
      Visual,
      
      // Console
      console: {
        log: (...args: unknown[]) => {
          self.consoleOutput.push(args.map(a => String(a)).join(' '));
        }
      },
      
      // Body part constants
      ATTACK: C.ATTACK,
      RANGED_ATTACK: C.RANGED_ATTACK,
      HEAL: C.HEAL,
      MOVE: C.MOVE,
      WORK: C.WORK,
      CARRY: C.CARRY,
      TOUGH: C.TOUGH,
      CLAIM: C.CLAIM,
      
      // Direction constants
      TOP: C.TOP,
      TOP_RIGHT: C.TOP_RIGHT,
      RIGHT: C.RIGHT,
      BOTTOM_RIGHT: C.BOTTOM_RIGHT,
      BOTTOM: C.BOTTOM,
      BOTTOM_LEFT: C.BOTTOM_LEFT,
      LEFT: C.LEFT,
      TOP_LEFT: C.TOP_LEFT,
      
      // Terrain constants
      TERRAIN_PLAIN: C.TERRAIN_PLAIN,
      TERRAIN_WALL: C.TERRAIN_WALL,
      TERRAIN_SWAMP: C.TERRAIN_SWAMP,
      
      // Resource constants
      RESOURCE_ENERGY: C.RESOURCE_ENERGY,
      
      // Error constants
      OK: C.OK,
      ERR_NOT_OWNER: C.ERR_NOT_OWNER,
      ERR_NO_PATH: C.ERR_NO_PATH,
      ERR_BUSY: C.ERR_BUSY,
      ERR_NOT_FOUND: C.ERR_NOT_FOUND,
      ERR_NOT_ENOUGH_RESOURCES: C.ERR_NOT_ENOUGH_RESOURCES,
      ERR_INVALID_TARGET: C.ERR_INVALID_TARGET,
      ERR_FULL: C.ERR_FULL,
      ERR_NOT_IN_RANGE: C.ERR_NOT_IN_RANGE,
      ERR_INVALID_ARGS: C.ERR_INVALID_ARGS,
      ERR_TIRED: C.ERR_TIRED,
      ERR_NO_BODYPART: C.ERR_NO_BODYPART,
    };
    
    return vm.createContext(sandbox);
  }
  
  /**
   * Initialize script by running it once to define functions
   */
  private initializeScript(): void {
    try {
      // Compile and run the script to define functions/globals
      this.script = new vm.Script(this.scriptSource, {
        filename: `player_${this.playerId}.js`
      });
      
      this.script.runInContext(this.context);
      
      // Get reference to loop function if defined
      if (typeof this.context.loop === 'function') {
        this.loopFn = this.context.loop as () => void;
      }
    } catch (error) {
      // Script compilation/initialization error - store for later reporting
      this.initError = error instanceof Error ? error.message : String(error);
      console.error(`[${this.playerId}] Script initialization error:`, error);
    }
  }
  
  /**
   * Check if script initialization failed
   */
  hasInitError(): boolean {
    return this.initError !== null;
  }
  
  /**
   * Get the initialization error message, if any
   */
  getInitError(): string | null {
    return this.initError;
  }
  
  /**
   * Run a single tick
   */
  runTick(input: TickInput): ScriptResult {
    const startTime = performance.now();
    this.tickStartTime = startTime;
    
    // Update per-tick state
    this.objects = input.objects;
    this.tick = input.tick;
    this.terrain = input.terrain;
    this.generateId = input.generateId;
    
    // Clear per-tick outputs
    this.intents = { objects: {} };
    this.consoleOutput = [];
    
    // Refresh object cache (update existing wrappers, mark destroyed ones)
    this.refreshObjectCache();
    
    try {
      // Call the loop function
      if (this.loopFn) {
        this.loopFn();
      }
      
      const cpuUsed = performance.now() - startTime;
      
      return {
        intents: this.intents,
        console: this.consoleOutput,
        cpuUsed
      };
    } catch (error) {
      const cpuUsed = performance.now() - startTime;
      
      return {
        intents: this.intents,
        console: this.consoleOutput,
        error: error instanceof Error ? error.message : String(error),
        cpuUsed
      };
    }
  }
  
  /**
   * Refresh the object cache to maintain stable identity
   * - Update existing wrappers with new data
   * - Mark destroyed objects as exists=false
   * - Create new wrappers for new objects
   */
  private refreshObjectCache(): void {
    const currentIds = new Set(this.objects.keys());
    
    // Mark objects that no longer exist
    for (const [id, wrapper] of this.objectCache) {
      if (!currentIds.has(id)) {
        wrapper.exists = false;
      }
    }
    
    // Update or create wrappers for current objects
    for (const [id, runtimeObj] of this.objects) {
      let wrapper = this.objectCache.get(id);
      
      if (wrapper) {
        // Update existing wrapper in place
        this.updateWrapper(wrapper, runtimeObj);
      } else {
        // Create new wrapper
        wrapper = this.createWrapper(runtimeObj);
        this.objectCache.set(id, wrapper);
      }
    }
  }
  
  /**
   * Update an existing wrapper with new runtime object data
   */
  private updateWrapper(wrapper: WrappedObject, obj: RuntimeObject): void {
    wrapper.x = obj.x;
    wrapper.y = obj.y;
    wrapper.exists = true;
    
    if (obj.type === 'creep') {
      const creep = obj as RuntimeCreep;
      wrapper.hits = creep.hits;
      wrapper.hitsMax = creep.hitsMax;
      wrapper.fatigue = creep.fatigue;
      wrapper.body = creep.body;
      wrapper.spawning = creep.spawning;
      this.updateStore(wrapper, creep.store, creep.body.filter(p => p.type === 'carry').length * C.CARRY_CAPACITY);
    } else if (obj.type === 'spawn') {
      const spawn = obj as RuntimeSpawn;
      wrapper.hits = spawn.hits;
      wrapper.hitsMax = spawn.hitsMax;
      this.updateStore(wrapper, spawn.store, C.SPAWN_ENERGY_CAPACITY);
      this.updateSpawning(wrapper, spawn);
    } else if (obj.type === 'tower') {
      const tower = obj as RuntimeTower;
      wrapper.hits = tower.hits;
      wrapper.hitsMax = tower.hitsMax;
      wrapper.cooldown = tower.cooldown;
      this.updateStore(wrapper, tower.store, C.TOWER_CAPACITY);
    } else if (obj.type === 'source') {
      const source = obj as RuntimeSource;
      wrapper.energy = source.energy;
    } else if (obj.type === 'energy' || obj.type === 'resource') {
      const resource = obj as RuntimeResource;
      wrapper.amount = resource.amount;
    } else if (obj.type === 'constructionSite') {
      const site = obj as unknown as { progress: number; progressTotal: number };
      wrapper.progress = site.progress || 0;
      wrapper.progressTotal = site.progressTotal || 0;
    }
  }
  
  /**
   * Update store object in place
   */
  private updateStore(wrapper: WrappedObject, storeData: Record<string, number> | unknown, capacity: number): void {
    const data = (storeData as Record<string, number>) || {};
    const usedCapacity = Object.values(data).reduce((a, b) => a + b, 0);
    
    // Get or create store object
    let store = wrapper.store as Record<string, unknown>;
    if (!store) {
      store = {};
      wrapper.store = store;
    }
    
    store.energy = data.energy || 0;
    store.getCapacity = (resource?: string) => {
      if (resource !== undefined) {
        return resource === 'energy' ? capacity : null;
      }
      return capacity;
    };
    store.getUsedCapacity = (resource?: string) => {
      if (resource !== undefined) {
        return data[resource] || 0;
      }
      return usedCapacity;
    };
    store.getFreeCapacity = (resource?: string) => {
      if (resource !== undefined) {
        if (resource !== 'energy') return null;
        return capacity - (data[resource] || 0);
      }
      return capacity - usedCapacity;
    };
  }
  
  /**
   * Update spawning sub-object
   */
  private updateSpawning(wrapper: WrappedObject, spawn: RuntimeSpawn): void {
    const spawnData = spawn.spawning as { creep?: unknown; needTime?: number; remainingTime?: number } | null;
    const isMy = spawn.user === this.playerId;
    const self = this;
    
    if (spawnData) {
      wrapper.spawning = {
        creep: spawnData.creep,
        needTime: spawnData.needTime ?? C.CREEP_SPAWN_TIME,
        remainingTime: spawnData.remainingTime ?? 0,
        cancel: () => {
          if (!isMy) return C.ERR_NOT_OWNER;
          self.addIntent(spawn._id, { cancelSpawning: {} });
          return C.OK;
        }
      };
    } else {
      wrapper.spawning = null;
    }
  }
  
  /**
   * Create a new wrapper for a runtime object
   */
  private createWrapper(obj: RuntimeObject): WrappedObject {
    const self = this;
    const playerId = this.playerId;
    
    if (obj.type === 'creep') {
      return this.createCreepWrapper(obj as RuntimeCreep);
    }
    
    if (obj.type === 'spawn') {
      return this.createSpawnWrapper(obj as RuntimeSpawn);
    }
    
    if (obj.type === 'tower') {
      return this.createTowerWrapper(obj as RuntimeTower);
    }
    
    if (obj.type === 'source') {
      return this.createSourceWrapper(obj as RuntimeSource);
    }
    
    if (obj.type === 'energy' || obj.type === 'resource') {
      return this.createResourceWrapper(obj as RuntimeResource);
    }
    
    if (obj.type === 'constructionSite') {
      return this.createConstructionSiteWrapper(obj);
    }
    
    // Generic fallback
    const wrapper: WrappedObject = {
      id: obj._id,
      x: obj.x,
      y: obj.y,
      exists: true
    };
    this.addGameObjectMethods(wrapper, obj);
    return wrapper;
  }
  
  /**
   * Create creep wrapper with all methods
   */
  private createCreepWrapper(creep: RuntimeCreep): WrappedObject {
    const self = this;
    const isMy = creep.user === this.playerId;
    const carryCapacity = creep.body.filter(p => p.type === 'carry').length * C.CARRY_CAPACITY;
    
    const wrapper: WrappedObject = {
      id: creep._id,
      x: creep.x,
      y: creep.y,
      my: isMy,
      hits: creep.hits,
      hitsMax: creep.hitsMax,
      fatigue: creep.fatigue,
      body: creep.body,
      spawning: creep.spawning,
      exists: true,
      [this.prototypeMarkers.Creep]: true,
      
      attack: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 1) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { attack: { id: target.id } });
        return C.OK;
      },
      
      rangedAttack: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.RANGED_ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 3) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { rangedAttack: { id: target.id } });
        return C.OK;
      },
      
      rangedMassAttack: () => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.RANGED_ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
        self.addIntent(creep._id, { rangedMassAttack: {} });
        return C.OK;
      },
      
      heal: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.HEAL && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 1) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { heal: { id: target.id } });
        return C.OK;
      },
      
      rangedHeal: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.HEAL && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 3) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { rangedHeal: { id: target.id } });
        return C.OK;
      },
      
      move: (direction: DirectionConstant) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { move: { direction } });
        return C.OK;
      },
      
      moveTo: (target: { x: number; y: number }, opts?: { costMatrix?: CostMatrix; range?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        
        const range = opts?.range ?? 0;
        const currentRange = Math.max(Math.abs(target.x - (w.x as number)), Math.abs(target.y - (w.y as number)));
        if (currentRange <= range) return C.OK;
        
        const path = self.findPath({ x: w.x as number, y: w.y as number }, target, { range, costMatrix: opts?.costMatrix });
        if (path.length === 0) return C.ERR_NO_PATH;
        
        const nextStep = path[0];
        const dx = nextStep.x - (w.x as number);
        const dy = nextStep.y - (w.y as number);
        
        // Already at target if no movement needed
        if (dx === 0 && dy === 0) return C.OK;
        
        const direction = arenaGetDirection(dx, dy);
        self.addIntent(creep._id, { move: { direction: direction as DirectionConstant } });
        return C.OK;
      },
      
      harvest: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 1) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { harvest: { id: target.id } });
        return C.OK;
      },
      
      build: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 3) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { build: { id: target.id } });
        return C.OK;
      },
      
      repair: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 3) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { repair: { id: target.id } });
        return C.OK;
      },
      
      dismantle: (target: { id: string; x?: number; y?: number }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        const w = self.objectCache.get(creep._id);
        if (!w || !w.exists) return C.ERR_NOT_FOUND;
        const currentBody = w.body as Array<{ type: string; hits: number }>;
        if (!currentBody.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
        if (target.x !== undefined && target.y !== undefined) {
          const range = Math.max(Math.abs((w.x as number) - target.x), Math.abs((w.y as number) - target.y));
          if (range > 1) return C.ERR_NOT_IN_RANGE;
        }
        self.addIntent(creep._id, { dismantle: { id: target.id } });
        return C.OK;
      },
      
      transfer: (target: { id: string }, resourceType: string, amount?: number) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { transfer: { id: target.id, resourceType, amount } });
        return C.OK;
      },
      
      withdraw: (target: { id: string }, resourceType: string, amount?: number) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { withdraw: { id: target.id, resourceType, amount } });
        return C.OK;
      },
      
      drop: (resourceType: string, amount?: number) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { drop: { resourceType, amount } });
        return C.OK;
      },
      
      pickup: (target: { id: string }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { pickup: { id: target.id } });
        return C.OK;
      },
      
      pull: (target: { id: string }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(creep._id, { pull: { id: target.id } });
        return C.OK;
      }
    };
    
    this.updateStore(wrapper, creep.store, carryCapacity);
    this.addGameObjectMethods(wrapper, creep);
    return wrapper;
  }
  
  /**
   * Create spawn wrapper
   */
  private createSpawnWrapper(spawn: RuntimeSpawn): WrappedObject {
    const self = this;
    const isMy = spawn.user === this.playerId;
    
    const wrapper: WrappedObject = {
      id: spawn._id,
      x: spawn.x,
      y: spawn.y,
      my: isMy,
      hits: spawn.hits,
      hitsMax: spawn.hitsMax,
      exists: true,
      spawning: null,
      directions: (spawn as unknown as { directions?: number[] }).directions ?? 
        [C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT],
      [this.prototypeMarkers.StructureSpawn]: true,
      
      spawnCreep: (body: BodyPartType[]) => {
        if (!isMy) return { error: C.ERR_NOT_OWNER };
        self.addIntent(spawn._id, { spawnCreep: { body } });
        return { object: null };
      },
      
      setDirections: (directions: number[]) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(spawn._id, { setDirections: { directions } });
        return C.OK;
      }
    };
    
    this.updateStore(wrapper, spawn.store, C.SPAWN_ENERGY_CAPACITY);
    this.updateSpawning(wrapper, spawn);
    this.addGameObjectMethods(wrapper, spawn);
    return wrapper;
  }
  
  /**
   * Create tower wrapper
   */
  private createTowerWrapper(tower: RuntimeTower): WrappedObject {
    const self = this;
    const isMy = tower.user === this.playerId;
    
    const wrapper: WrappedObject = {
      id: tower._id,
      x: tower.x,
      y: tower.y,
      my: isMy,
      hits: tower.hits,
      hitsMax: tower.hitsMax,
      cooldown: tower.cooldown,
      exists: true,
      [this.prototypeMarkers.StructureTower]: true,
      
      attack: (target: { id: string }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(tower._id, { towerAttack: { id: target.id } });
        return C.OK;
      },
      
      heal: (target: { id: string }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(tower._id, { towerHeal: { id: target.id } });
        return C.OK;
      },
      
      repair: (target: { id: string }) => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(tower._id, { towerRepair: { id: target.id } });
        return C.OK;
      }
    };
    
    this.updateStore(wrapper, tower.store, C.TOWER_CAPACITY);
    this.addGameObjectMethods(wrapper, tower);
    return wrapper;
  }
  
  /**
   * Create source wrapper
   */
  private createSourceWrapper(source: RuntimeSource): WrappedObject {
    const wrapper: WrappedObject = {
      id: source._id,
      x: source.x,
      y: source.y,
      energy: source.energy,
      energyCapacity: C.SOURCE_ENERGY_CAPACITY,
      exists: true,
      [this.prototypeMarkers.Source]: true
    };
    this.addGameObjectMethods(wrapper, source);
    return wrapper;
  }
  
  /**
   * Create resource wrapper
   */
  private createResourceWrapper(resource: RuntimeResource): WrappedObject {
    const wrapper: WrappedObject = {
      id: resource._id,
      x: resource.x,
      y: resource.y,
      amount: resource.amount,
      resourceType: C.RESOURCE_ENERGY,
      exists: true,
      [this.prototypeMarkers.Resource]: true
    };
    this.addGameObjectMethods(wrapper, resource);
    return wrapper;
  }
  
  /**
   * Create construction site wrapper
   */
  private createConstructionSiteWrapper(obj: RuntimeObject): WrappedObject {
    const self = this;
    const site = obj as unknown as { _id: string; x: number; y: number; progress: number; progressTotal: number; structureType: string; user: string };
    const isMy = site.user === this.playerId;
    
    const wrapper: WrappedObject = {
      id: site._id,
      x: site.x,
      y: site.y,
      progress: site.progress || 0,
      progressTotal: site.progressTotal || 0,
      structureType: site.structureType,
      my: isMy,
      exists: true,
      [this.prototypeMarkers.ConstructionSite]: true,
      
      remove: () => {
        if (!isMy) return C.ERR_NOT_OWNER;
        self.addIntent(site._id, { removeConstructionSite: {} });
        return C.OK;
      }
    };
    this.addGameObjectMethods(wrapper, obj);
    return wrapper;
  }
  
  /**
   * Add common GameObject methods
   */
  private addGameObjectMethods(wrapper: WrappedObject, obj: RuntimeObject): void {
    const self = this;
    
    wrapper.getRangeTo = (target: { x: number; y: number } | { pos: { x: number; y: number } }) => {
      const pos = 'pos' in target ? target.pos : target;
      return arenaGetRange({ x: wrapper.x, y: wrapper.y }, pos);
    };
    
    wrapper.findClosestByRange = <T extends { x: number; y: number }>(objects: T[]): T | null => {
      return arenaFindClosestByRange({ x: wrapper.x, y: wrapper.y }, objects);
    };
    
    wrapper.findInRange = <T extends { x: number; y: number }>(objects: T[], range: number): T[] => {
      return arenaFindInRange({ x: wrapper.x, y: wrapper.y }, objects, range);
    };
    
    wrapper.findPathTo = (target: { x: number; y: number }, opts?: { costMatrix?: CostMatrix; range?: number }) => {
      return self.findPath({ x: wrapper.x, y: wrapper.y }, target, opts);
    };
    
    wrapper.findClosestByPath = <T extends { x: number; y: number }>(
      objects: T[],
      opts?: { range?: number; costMatrix?: CostMatrix }
    ): T | null => {
      return self.findClosestByPath({ x: wrapper.x, y: wrapper.y }, objects, opts);
    };
  }
  
  // ========== API Implementation Methods ==========
  
  private getObjectsByPrototype<T>(prototype: { new(): T }): T[] {
    const results: T[] = [];
    const typeName = prototype.name.toLowerCase();
    
    for (const [id, wrapper] of this.objectCache) {
      if (!wrapper.exists) continue;
      
      let matches = false;
      if (typeName === 'creep' && wrapper[this.prototypeMarkers.Creep]) matches = true;
      if (typeName === 'structurespawn' && wrapper[this.prototypeMarkers.StructureSpawn]) matches = true;
      if (typeName === 'structuretower' && wrapper[this.prototypeMarkers.StructureTower]) matches = true;
      if (typeName === 'source' && wrapper[this.prototypeMarkers.Source]) matches = true;
      if (typeName === 'resource' && wrapper[this.prototypeMarkers.Resource]) matches = true;
      if (typeName === 'constructionsite' && wrapper[this.prototypeMarkers.ConstructionSite]) matches = true;
      
      if (matches) {
        results.push(wrapper as unknown as T);
      }
    }
    
    return results;
  }
  
  private getObjectById(id: string): unknown {
    const wrapper = this.objectCache.get(id);
    return wrapper && wrapper.exists ? wrapper : null;
  }
  
  private getObjects(): unknown[] {
    return Array.from(this.objectCache.values()).filter(w => w.exists);
  }
  
  private getTerrainAt(pos: { x: number; y: number }): number {
    if (!this.terrain) return C.TERRAIN_PLAIN;
    const arenaSize = DEFAULT_MAP_SIZE;
    if (pos.x < 0 || pos.x >= arenaSize || pos.y < 0 || pos.y >= arenaSize) return C.TERRAIN_WALL;
    return this.terrain[pos.y * arenaSize + pos.x] || C.TERRAIN_PLAIN;
  }
  
  private isWalkable(x: number, y: number): boolean {
    const arenaSize = DEFAULT_MAP_SIZE;
    if (x < 0 || x >= arenaSize || y < 0 || y >= arenaSize) return false;
    if (this.terrain) {
      const terrainType = this.terrain[y * arenaSize + x] || 0;
      if (terrainType === C.TERRAIN_WALL) return false;
    }
    return true;
  }
  
  private searchPath(
    origin: { x: number; y: number },
    goal: { pos: { x: number; y: number }; range?: number } | Array<{ pos: { x: number; y: number }; range?: number }>,
    opts?: { costMatrix?: CostMatrix; plainCost?: number; swampCost?: number }
  ): PathResult {
    const goals = Array.isArray(goal) ? goal : [goal];
    const plainCost = opts?.plainCost ?? 1;
    const swampCost = opts?.swampCost ?? 5;
    const costMatrix = opts?.costMatrix;
    const arenaSize = DEFAULT_MAP_SIZE;
    
    // Build set of goal positions
    const goalSet = new Set<string>();
    for (const g of goals) {
      const range = g.range ?? 0;
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const gx = g.pos.x + dx;
          const gy = g.pos.y + dy;
          if (gx >= 0 && gx < arenaSize && gy >= 0 && gy < arenaSize) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= range) {
              goalSet.add(`${gx},${gy}`);
            }
          }
        }
      }
    }
    
    // A* algorithm
    type Node = { x: number; y: number; g: number; h: number; parent: Node | null };
    const openSet: Node[] = [];
    const closedSet = new Set<string>();
    const gScores = new Map<string, number>();
    
    const heuristic = (x: number, y: number): number => {
      let minDist = Infinity;
      for (const g of goals) {
        const dist = Math.max(Math.abs(x - g.pos.x), Math.abs(y - g.pos.y));
        minDist = Math.min(minDist, Math.max(0, dist - (g.range ?? 0)));
      }
      return minDist;
    };
    
    const startNode: Node = { x: origin.x, y: origin.y, g: 0, h: heuristic(origin.x, origin.y), parent: null };
    openSet.push(startNode);
    gScores.set(`${origin.x},${origin.y}`, 0);
    
    const directions = [
      { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
      { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
    ];
    
    let ops = 0;
    const maxOps = 2000;
    
    while (openSet.length > 0 && ops < maxOps) {
      ops++;
      
      openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;
      
      if (goalSet.has(currentKey)) {
        const path: Array<{ x: number; y: number }> = [];
        let node: Node | null = current;
        while (node && node.parent) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return { path, ops, cost: current.g, incomplete: false };
      }
      
      closedSet.add(currentKey);
      
      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const neighborKey = `${nx},${ny}`;
        
        if (closedSet.has(neighborKey)) continue;
        if (!this.isWalkable(nx, ny)) continue;
        
        let moveCost = 1;
        if (costMatrix) {
          const cmCost = costMatrix.get(nx, ny);
          if (cmCost === 255) continue;
          if (cmCost > 0) moveCost = cmCost;
        } else if (this.terrain) {
          const terrainType = this.terrain[ny * arenaSize + nx] || 0;
          moveCost = terrainType === C.TERRAIN_SWAMP ? swampCost : plainCost;
        }
        
        const tentativeG = current.g + moveCost;
        const existingG = gScores.get(neighborKey);
        
        if (existingG === undefined || tentativeG < existingG) {
          gScores.set(neighborKey, tentativeG);
          const neighborNode: Node = {
            x: nx, y: ny, g: tentativeG, h: heuristic(nx, ny), parent: current
          };
          const existingIdx = openSet.findIndex(n => n.x === nx && n.y === ny);
          if (existingIdx >= 0) {
            openSet[existingIdx] = neighborNode;
          } else {
            openSet.push(neighborNode);
          }
        }
      }
    }
    
    let bestNode = startNode;
    let bestH = startNode.h;
    for (const key of closedSet) {
      const [x, y] = key.split(',').map(Number);
      const h = heuristic(x, y);
      if (h < bestH) {
        bestH = h;
        bestNode = { x, y, g: gScores.get(key) || 0, h, parent: null };
      }
    }
    
    return { path: [], ops, cost: bestNode.g, incomplete: true };
  }
  
  private findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    opts?: { costMatrix?: CostMatrix; range?: number }
  ): Array<{ x: number; y: number }> {
    const result = this.searchPath(from, [{ pos: to, range: opts?.range ?? 0 }], opts);
    return result.path;
  }
  
  private findClosestByPath<T extends { x: number; y: number }>(
    pos: { x: number; y: number },
    objects: T[],
    opts?: { range?: number; costMatrix?: CostMatrix }
  ): T | null {
    let closest: T | null = null;
    let shortestPath = Infinity;
    const range = opts?.range ?? 0;
    
    for (const obj of objects) {
      const result = this.searchPath(pos, [{ pos: obj, range }], { costMatrix: opts?.costMatrix });
      if (!result.incomplete && result.path.length < shortestPath) {
        shortestPath = result.path.length;
        closest = obj;
      }
    }
    
    return closest;
  }
  
  private createConstructionSite(pos: { x: number; y: number }, structureType: string): { object: unknown } | { error: number } {
    const siteId = this.generateId();
    this.addIntent('global', { 
      createConstructionSite: { 
        x: pos.x, 
        y: pos.y, 
        structureType,
        id: siteId
      } 
    });
    return { object: null };
  }
  
  private addIntent(objectId: string, intent: Partial<ObjectIntents>): void {
    if (!this.intents.objects[objectId]) {
      this.intents.objects[objectId] = {};
    }
    Object.assign(this.intents.objects[objectId], intent);
  }
  
  /**
   * Destroy this runner and clean up resources
   */
  destroy(): void {
    this.objectCache.clear();
    // Note: Don't clear this.objects - it's a reference to the game's objects map
    this.script = null;
    this.loopFn = null;
    // Note: vm.Context cannot be explicitly destroyed in Node,
    // it will be garbage collected when no references remain
  }
}
