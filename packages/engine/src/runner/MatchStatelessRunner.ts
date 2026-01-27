/**
 * MatchStatelessRunner - Stateless per-tick script runner
 * 
 * This runner re-evaluates the player script from scratch each tick.
 * No state persists between ticks - each tick gets a fresh execution context.
 * 
 * For Arena-compatible persistent state across ticks, use MatchRunner instead.
 * 
 * NOTE: This is NOT a security boundary. Use isolated-vm in production
 * for untrusted code execution.
 */

import type { 
  RuntimeObject, 
  RuntimeCreep,
  RuntimeSpawn,
  RuntimeTower,
  RuntimeSource,
  RuntimeResource,
  UserIntents,
  ObjectIntents,
  Player
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

/**
 * Script execution result
 */
export interface ScriptResult {
  intents: UserIntents;
  console: string[];
  error?: string;
  cpuUsed: number;
}

/**
 * Game object as seen by player script
 */
export interface PlayerCreep {
  id: string;
  x: number;
  y: number;
  my: boolean;
  hits: number;
  hitsMax: number;
  fatigue: number;
  body: Array<{ type: string; hits: number }>;
  store: { energy: number };
  
  // Methods (these capture intents)
  attack(target: { id: string }): number;
  rangedAttack(target: { id: string }): number;
  rangedMassAttack(): number;
  heal(target: { id: string }): number;
  rangedHeal(target: { id: string }): number;
  move(direction: DirectionConstant): number;
  moveTo(target: { x: number; y: number }): number;
  harvest(target: { id: string }): number;
  transfer(target: { id: string }, resourceType: string, amount?: number): number;
  withdraw(target: { id: string }, resourceType: string, amount?: number): number;
  drop(resourceType: string, amount?: number): number;
  pickup(target: { id: string }): number;
  pull(target: { id: string }): number;
}

/**
 * Path search result
 */
export interface PathResult {
  path: Array<{ x: number; y: number }>;
  ops: number;
  cost: number;
  incomplete: boolean;
}

/**
 * CostMatrix for pathfinding
 */
export class CostMatrix {
  private static readonly SIZE = DEFAULT_MAP_SIZE;
  private data: Uint8Array = new Uint8Array(CostMatrix.SIZE * CostMatrix.SIZE);
  
  get(x: number, y: number): number {
    return this.data[y * CostMatrix.SIZE + x] || 0;
  }
  
  set(x: number, y: number, cost: number): void {
    this.data[y * CostMatrix.SIZE + x] = Math.min(255, Math.max(0, cost));
  }
  
  clone(): CostMatrix {
    const c = new CostMatrix();
    c.data.set(this.data);
    return c;
  }
}

/**
 * Visual for debug drawing (collects draw commands)
 */
export class Visual {
  private layer: number;
  private commands: Array<{ type: string; args: unknown[] }> = [];
  private persistent: boolean;
  
  constructor(layer: number = 0, persistent: boolean = false) {
    this.layer = layer;
    this.persistent = persistent;
  }
  
  circle(pos: { x: number; y: number }, style?: Record<string, unknown>): Visual {
    this.commands.push({ type: 'circle', args: [pos, style] });
    return this;
  }
  
  line(pos1: { x: number; y: number }, pos2: { x: number; y: number }, style?: Record<string, unknown>): Visual {
    this.commands.push({ type: 'line', args: [pos1, pos2, style] });
    return this;
  }
  
  rect(pos: { x: number; y: number }, width: number, height: number, style?: Record<string, unknown>): Visual {
    this.commands.push({ type: 'rect', args: [pos, width, height, style] });
    return this;
  }
  
  poly(points: Array<{ x: number; y: number }>, style?: Record<string, unknown>): Visual {
    this.commands.push({ type: 'poly', args: [points, style] });
    return this;
  }
  
  text(text: string, pos: { x: number; y: number }, style?: Record<string, unknown>): Visual {
    this.commands.push({ type: 'text', args: [text, pos, style] });
    return this;
  }
  
  clear(): Visual {
    this.commands = [];
    return this;
  }
  
  getSize(): number {
    return JSON.stringify(this.commands).length;
  }
  
  // Export for renderer
  export(): { layer: number; persistent: boolean; commands: Array<{ type: string; args: unknown[] }> } {
    return { layer: this.layer, persistent: this.persistent, commands: this.commands };
  }
}

/**
 * Game globals provided to player scripts
 */
export interface GameGlobals {
  Creep: { new(): PlayerCreep };
  StructureSpawn: { new(): unknown };
  StructureTower: { new(): unknown };
  Source: { new(): unknown };
  Resource: { new(): unknown };
  ConstructionSite: { new(): unknown };
  
  // Utility functions
  getObjectsByPrototype<T>(prototype: { new(): T }): T[];
  getObjectById(id: string): unknown;
  getObjects(): unknown[];
  getTicks(): number;
  getTerrainAt(pos: { x: number; y: number }): number;
  getRange(a: { x: number; y: number }, b: { x: number; y: number }): number;
  getDirection(dx: number, dy: number): number;
  getCpuTime(): number;
  findClosestByRange<T extends { x: number; y: number }>(pos: { x: number; y: number }, objects: T[]): T | null;
  findInRange<T extends { x: number; y: number }>(pos: { x: number; y: number }, objects: T[], range: number): T[];
  findClosestByPath<T extends { x: number; y: number }>(pos: { x: number; y: number }, objects: T[], opts?: { range?: number }): T | null;
  findPath(from: { x: number; y: number }, to: { x: number; y: number }, opts?: { costMatrix?: CostMatrix; range?: number }): Array<{ x: number; y: number }>;
  searchPath(origin: { x: number; y: number }, goal: { pos: { x: number; y: number }; range?: number } | Array<{ pos: { x: number; y: number }; range?: number }>, opts?: { costMatrix?: CostMatrix }): PathResult;
  createConstructionSite(pos: { x: number; y: number }, structureType: string): { object: unknown } | { error: number };
  
  // Classes
  CostMatrix: typeof CostMatrix;
  Visual: typeof Visual;
}

/**
 * Player script runner
 * Executes player code and collects intents
 * 
 * NOTE: In production, this should use isolated-vm for sandboxing.
 * This is a simplified implementation using Function() for demonstration.
 */
export class MatchStatelessRunner {
  private objects: Map<string, RuntimeObject>;
  private playerId: string;
  private tick: number;
  private intents: UserIntents = { objects: {} };
  private consoleOutput: string[] = [];
  private terrain: Uint8Array | null;
  private tickStartTime: number = 0;
  private generateId: () => string;
  
  constructor(
    objects: Map<string, RuntimeObject>,
    playerId: string,
    tick: number,
    terrain: Uint8Array | undefined,
    generateId: () => string
  ) {
    this.objects = objects;
    this.playerId = playerId;
    this.tick = tick;
    this.terrain = terrain ?? null;
    this.generateId = generateId;
  }
  
  /**
   * Run a player's script
   */
  run(script: string): ScriptResult {
    const startTime = performance.now();
    this.tickStartTime = startTime;
    this.intents = { objects: {} };
    this.consoleOutput = [];
    
    try {
      // Create game globals
      const globals = this.createGlobals();
      
      // Execute script in a sandboxed context
      // NOTE: This is NOT secure - use isolated-vm in production
      const paramNames = [
        'Creep', 'StructureSpawn', 'StructureTower', 'Source', 'Resource', 'ConstructionSite',
        'getObjectsByPrototype', 'getObjectById', 'getObjects', 'getTicks', 'getTerrainAt',
        'getRange', 'findClosestByRange', 'findInRange', 'findClosestByPath', 'findPath',
        'getCpuTime', 'getDirection', 'createConstructionSite', 'searchPath',
        'CostMatrix', 'Visual',
        'console',
        // Body part constants
        'ATTACK', 'RANGED_ATTACK', 'HEAL', 'MOVE', 'WORK', 'CARRY', 'TOUGH', 'CLAIM',
        // Direction constants
        'TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT',
        // Terrain constants
        'TERRAIN_PLAIN', 'TERRAIN_WALL', 'TERRAIN_SWAMP',
        // Resource constants
        'RESOURCE_ENERGY',
        // Error constants
        'OK', 'ERR_NOT_OWNER', 'ERR_NO_PATH', 'ERR_BUSY', 'ERR_NOT_FOUND',
        'ERR_NOT_ENOUGH_RESOURCES', 'ERR_INVALID_TARGET', 'ERR_FULL',
        'ERR_NOT_IN_RANGE', 'ERR_INVALID_ARGS', 'ERR_TIRED', 'ERR_NO_BODYPART'
      ];
      
      const scriptBody = `
        ${script}
        
        // Call loop function
        if (typeof loop === 'function') {
          loop();
        }
      `;
      
      const fn = new Function(...paramNames, scriptBody);
      
      fn(
        globals.Creep,
        globals.StructureSpawn,
        globals.StructureTower,
        globals.Source,
        globals.Resource,
        globals.ConstructionSite,
        globals.getObjectsByPrototype,
        globals.getObjectById,
        globals.getObjects,
        globals.getTicks,
        globals.getTerrainAt,
        globals.getRange,
        globals.findClosestByRange,
        globals.findInRange,
        globals.findClosestByPath,
        globals.findPath,
        globals.getCpuTime,
        globals.getDirection,
        globals.createConstructionSite,
        globals.searchPath,
        globals.CostMatrix,
        globals.Visual,
        this.createConsole(),
        // Body part constants
        C.ATTACK,
        C.RANGED_ATTACK,
        C.HEAL,
        C.MOVE,
        C.WORK,
        C.CARRY,
        C.TOUGH,
        C.CLAIM,
        // Direction constants
        C.TOP,
        C.TOP_RIGHT,
        C.RIGHT,
        C.BOTTOM_RIGHT,
        C.BOTTOM,
        C.BOTTOM_LEFT,
        C.LEFT,
        C.TOP_LEFT,
        // Terrain constants
        C.TERRAIN_PLAIN,
        C.TERRAIN_WALL,
        C.TERRAIN_SWAMP,
        // Resource constants
        C.RESOURCE_ENERGY,
        // Error constants
        C.OK,
        C.ERR_NOT_OWNER,
        C.ERR_NO_PATH,
        C.ERR_BUSY,
        C.ERR_NOT_FOUND,
        C.ERR_NOT_ENOUGH_RESOURCES,
        C.ERR_INVALID_TARGET,
        C.ERR_FULL,
        C.ERR_NOT_IN_RANGE,
        C.ERR_INVALID_ARGS,
        C.ERR_TIRED,
        C.ERR_NO_BODYPART
      );
      
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
   * Create console object for player script
   */
  private createConsole() {
    return {
      log: (...args: unknown[]) => {
        this.consoleOutput.push(args.map(a => String(a)).join(' '));
      }
    };
  }
  
  /**
   * Create game globals for player script
   */
  private createGlobals(): GameGlobals {
    const self = this;
    const playerId = this.playerId;
    
    // Create prototype classes
    class Creep {
      constructor() {}
    }
    
    class StructureSpawn {
      constructor() {}
    }
    
    class StructureTower {
      constructor() {}
    }
    
    class Source {
      constructor() {}
    }
    
    class Resource {
      constructor() {}
    }
    
    class ConstructionSite {
      constructor() {}
    }
    
    // Use centralized utility functions from @skirmish/types
    const getRange = arenaGetRange;
    const getDirection = arenaGetDirection;
    
    // Helper: Check if position is walkable
    const arenaSize = DEFAULT_MAP_SIZE;
    const isWalkable = (x: number, y: number): boolean => {
      if (x < 0 || x >= arenaSize || y < 0 || y >= arenaSize) return false;
      if (self.terrain) {
        const terrainType = self.terrain[y * arenaSize + x] || 0;
        if (terrainType === C.TERRAIN_WALL) return false;
      }
      return true;
    };
    
    // A* pathfinding implementation
    const searchPath = (
      origin: { x: number; y: number },
      goals: Array<{ pos: { x: number; y: number }; range?: number }>,
      opts?: { costMatrix?: CostMatrix; plainCost?: number; swampCost?: number }
    ): PathResult => {
      const plainCost = opts?.plainCost ?? 1;
      const swampCost = opts?.swampCost ?? 5;
      const costMatrix = opts?.costMatrix;
      
      // Build set of goal positions
      const goalSet = new Set<string>();
      for (const goal of goals) {
        const range = goal.range ?? 0;
        for (let dx = -range; dx <= range; dx++) {
          for (let dy = -range; dy <= range; dy++) {
            const gx = goal.pos.x + dx;
            const gy = goal.pos.y + dy;
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
        for (const goal of goals) {
          const dist = Math.max(Math.abs(x - goal.pos.x), Math.abs(y - goal.pos.y));
          minDist = Math.min(minDist, Math.max(0, dist - (goal.range ?? 0)));
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
        
        // Get node with lowest f score
        openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
        const current = openSet.shift()!;
        const currentKey = `${current.x},${current.y}`;
        
        // Check if reached goal
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
        
        // Expand neighbors
        for (const dir of directions) {
          const nx = current.x + dir.dx;
          const ny = current.y + dir.dy;
          const neighborKey = `${nx},${ny}`;
          
          if (closedSet.has(neighborKey)) continue;
          if (!isWalkable(nx, ny)) continue;
          
          // Calculate movement cost
          let moveCost = 1;
          if (costMatrix) {
            const cmCost = costMatrix.get(nx, ny);
            if (cmCost === 255) continue; // Impassable
            if (cmCost > 0) moveCost = cmCost;
          } else if (self.terrain) {
            const terrainType = self.terrain[ny * arenaSize + nx] || 0;
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
      
      // No path found - return incomplete path to closest position
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
    };
    
    // Create globals object with lazy wrapObject binding
    const globals: GameGlobals = {
      Creep: Creep as unknown as { new(): PlayerCreep },
      StructureSpawn: StructureSpawn as unknown as { new(): unknown },
      StructureTower: StructureTower as unknown as { new(): unknown },
      Source: Source as unknown as { new(): unknown },
      Resource: Resource as unknown as { new(): unknown },
      ConstructionSite: ConstructionSite as unknown as { new(): unknown },
      
      getObjectsByPrototype: <T>(prototype: { new(): T }): T[] => {
        const results: T[] = [];
        const typeName = prototype.name.toLowerCase();
        
        for (const obj of self.objects.values()) {
          let matches = false;
          
          if (typeName === 'creep' && obj.type === 'creep') matches = true;
          if (typeName === 'structurespawn' && obj.type === 'spawn') matches = true;
          if (typeName === 'structuretower' && obj.type === 'tower') matches = true;
          if (typeName === 'source' && obj.type === 'source') matches = true;
          if (typeName === 'resource' && obj.type === 'energy') matches = true;
          if (typeName === 'constructionsite' && obj.type === 'constructionSite') matches = true;
          
          if (matches) {
            results.push(self.wrapObject(obj, globals) as T);
          }
        }
        
        return results;
      },
      
      getObjectById: (id: string) => {
        const obj = self.objects.get(id);
        return obj ? self.wrapObject(obj, globals) : null;
      },
      
      getObjects: () => {
        return Array.from(self.objects.values()).map(obj => self.wrapObject(obj, globals));
      },
      
      getTicks: () => self.tick,
      
      getTerrainAt: (pos: { x: number; y: number }) => {
        if (!self.terrain) return C.TERRAIN_PLAIN;
        if (pos.x < 0 || pos.x >= arenaSize || pos.y < 0 || pos.y >= arenaSize) return C.TERRAIN_WALL;
        return self.terrain[pos.y * arenaSize + pos.x] || C.TERRAIN_PLAIN;
      },
      
      getRange,
      
      getDirection,
      
      getCpuTime: () => {
        return performance.now() - self.tickStartTime;
      },
      
      findClosestByRange: arenaFindClosestByRange,
      
      findInRange: arenaFindInRange,
      
      findClosestByPath: <T extends { x: number; y: number }>(
        pos: { x: number; y: number },
        objects: T[],
        opts?: { range?: number; costMatrix?: CostMatrix }
      ): T | null => {
        let closest: T | null = null;
        let shortestPath = Infinity;
        const range = opts?.range ?? 0;
        
        for (const obj of objects) {
          const result = searchPath(pos, [{ pos: obj, range }], { costMatrix: opts?.costMatrix });
          if (!result.incomplete && result.path.length < shortestPath) {
            shortestPath = result.path.length;
            closest = obj;
          }
        }
        
        // Fallback to range-based if no path found
        if (!closest) {
          return null;
        }
        
        return closest;
      },
      
      findPath: (
        from: { x: number; y: number },
        to: { x: number; y: number },
        opts?: { costMatrix?: CostMatrix; range?: number }
      ) => {
        const result = searchPath(from, [{ pos: to, range: opts?.range ?? 0 }], opts);
        return result.path;
      },
      
      searchPath: (
        origin: { x: number; y: number },
        goal: { pos: { x: number; y: number }; range?: number } | Array<{ pos: { x: number; y: number }; range?: number }>,
        opts?: { costMatrix?: CostMatrix }
      ): PathResult => {
        const goals = Array.isArray(goal) ? goal : [goal];
        return searchPath(origin, goals, opts);
      },
      
      createConstructionSite: (pos: { x: number; y: number }, structureType: string) => {
        // Add intent for construction site creation
        const siteId = self.generateId();
        self.addIntent('global', { 
          createConstructionSite: { 
            x: pos.x, 
            y: pos.y, 
            structureType,
            id: siteId
          } 
        });
        return { object: null }; // Object will be created after intent processing
      },
      
      CostMatrix,
      Visual
    };
    
    return globals;
  }
  
  /**
   * Create a proper Store object with Arena API methods
   */
  private wrapStore(store: Record<string, number> | unknown, capacity: number): unknown {
    const storeData = (store as Record<string, number>) || {};
    const usedCapacity = Object.values(storeData).reduce((a, b) => a + b, 0);
    
    return {
      energy: storeData.energy || 0,
      
      getCapacity: (resource?: string) => {
        // In Arena, creeps/structures with capacity can hold energy
        // Return capacity for energy requests, null only for unsupported resources
        if (resource !== undefined) {
          // Arena only supports energy, so return capacity for energy, null for others
          return resource === 'energy' ? capacity : null;
        }
        return capacity;
      },
      
      getUsedCapacity: (resource?: string) => {
        if (resource !== undefined) {
          return storeData[resource] || 0;
        }
        return usedCapacity;
      },
      
      getFreeCapacity: (resource?: string) => {
        if (resource !== undefined) {
          // Arena only supports energy - return free capacity for energy, null for others
          if (resource !== 'energy') {
            return null;
          }
          return capacity - (storeData[resource] || 0);
        }
        return capacity - usedCapacity;
      }
    };
  }
  
  /**
   * Add common GameObject methods to a wrapped object
   */
  private addGameObjectMethods(
    wrapped: Record<string, unknown>,
    obj: RuntimeObject,
    globals: GameGlobals
  ): void {
    const x = obj.x;
    const y = obj.y;
    
    wrapped.getRangeTo = (target: { x: number; y: number } | { pos: { x: number; y: number } }) => {
      const pos = 'pos' in target ? target.pos : target;
      return globals.getRange({ x, y }, pos);
    };
    
    wrapped.findClosestByRange = <T extends { x: number; y: number }>(objects: T[]): T | null => {
      return globals.findClosestByRange({ x, y }, objects);
    };
    
    wrapped.findInRange = <T extends { x: number; y: number }>(objects: T[], range: number): T[] => {
      return globals.findInRange({ x, y }, objects, range);
    };
    
    wrapped.findPathTo = (target: { x: number; y: number }, opts?: { costMatrix?: CostMatrix; range?: number }) => {
      return globals.findPath({ x, y }, target, opts);
    };
    
    wrapped.findClosestByPath = <T extends { x: number; y: number }>(
      objects: T[],
      opts?: { range?: number; costMatrix?: CostMatrix }
    ): T | null => {
      return globals.findClosestByPath({ x, y }, objects, opts);
    };
  }
  
  /**
   * Wrap a runtime object with player-accessible methods
   */
  private wrapObject(obj: RuntimeObject, globals?: GameGlobals): unknown {
    const self = this;
    
    // Get globals if not provided (for recursive calls)
    const g = globals || this.createGlobals();
    
    if (obj.type === 'creep') {
      const creep = obj as RuntimeCreep;
      const isMy = creep.user === this.playerId;
      const carryCapacity = creep.body.filter(p => p.type === 'carry').length * C.CARRY_CAPACITY;
      
      const wrapped: Record<string, unknown> = {
        id: creep._id,
        x: creep.x,
        y: creep.y,
        my: isMy,
        hits: creep.hits,
        hitsMax: creep.hitsMax,
        fatigue: creep.fatigue,
        body: creep.body,
        store: this.wrapStore(creep.store, carryCapacity),
        spawning: creep.spawning,
        exists: true,
        
        attack: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for ATTACK body part
          if (!creep.body.some(p => p.type === C.ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (attack range is 1)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 1) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { attack: { id: target.id } });
          return C.OK;
        },
        
        rangedAttack: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for RANGED_ATTACK body part
          if (!creep.body.some(p => p.type === C.RANGED_ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (ranged attack range is 3)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 3) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { rangedAttack: { id: target.id } });
          return C.OK;
        },
        
        rangedMassAttack: () => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for RANGED_ATTACK body part
          if (!creep.body.some(p => p.type === C.RANGED_ATTACK && p.hits > 0)) return C.ERR_NO_BODYPART;
          self.addIntent(creep._id, { rangedMassAttack: {} });
          return C.OK;
        },
        
        heal: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for HEAL body part
          if (!creep.body.some(p => p.type === C.HEAL && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (heal range is 1)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 1) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { heal: { id: target.id } });
          return C.OK;
        },
        
        rangedHeal: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for HEAL body part
          if (!creep.body.some(p => p.type === C.HEAL && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (ranged heal range is 3)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
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
          
          const range = opts?.range ?? 0;
          const currentRange = Math.max(Math.abs(target.x - creep.x), Math.abs(target.y - creep.y));
          if (currentRange <= range) return C.OK; // Already in range
          
          // Use pathfinding to find the next step
          const path = g.findPath({ x: creep.x, y: creep.y }, target, { range, costMatrix: opts?.costMatrix });
          
          if (path.length === 0) return C.ERR_NO_PATH;
          
          const nextStep = path[0];
          const dx = nextStep.x - creep.x;
          const dy = nextStep.y - creep.y;
          const direction = g.getDirection(dx, dy);
          
          if (direction === 0) return C.OK; // Already at target
          
          self.addIntent(creep._id, { move: { direction: direction as DirectionConstant } });
          return C.OK;
        },
        
        harvest: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for WORK body part
          if (!creep.body.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (harvest range is 1)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 1) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { harvest: { id: target.id } });
          return C.OK;
        },
        
        build: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for WORK body part
          if (!creep.body.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (build range is 3)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 3) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { build: { id: target.id } });
          return C.OK;
        },
        
        repair: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for WORK body part
          if (!creep.body.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (repair range is 3)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
            if (range > 3) return C.ERR_NOT_IN_RANGE;
          }
          self.addIntent(creep._id, { repair: { id: target.id } });
          return C.OK;
        },
        
        dismantle: (target: { id: string; x?: number; y?: number }) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          // Check for WORK body part
          if (!creep.body.some(p => p.type === C.WORK && p.hits > 0)) return C.ERR_NO_BODYPART;
          // Check range (dismantle range is 1)
          if (target.x !== undefined && target.y !== undefined) {
            const range = Math.max(Math.abs(creep.x - target.x), Math.abs(creep.y - target.y));
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
      
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    if (obj.type === 'spawn') {
      const spawn = obj as RuntimeSpawn;
      const isMy = spawn.user === this.playerId;
      const spawnData = spawn.spawning as { creep?: unknown; needTime?: number; remainingTime?: number } | null;
      
      const wrapped: Record<string, unknown> = {
        id: spawn._id,
        x: spawn.x,
        y: spawn.y,
        my: isMy,
        hits: spawn.hits,
        hitsMax: spawn.hitsMax,
        store: this.wrapStore(spawn.store, C.SPAWN_ENERGY_CAPACITY),
        exists: true,
        
        // Spawning sub-object with cancel method
        spawning: spawnData ? {
          creep: spawnData.creep,
          needTime: spawnData.needTime ?? C.CREEP_SPAWN_TIME,
          remainingTime: spawnData.remainingTime ?? 0,
          cancel: () => {
            if (!isMy) return C.ERR_NOT_OWNER;
            self.addIntent(spawn._id, { cancelSpawning: {} });
            return C.OK;
          }
        } : null,
        
        // Spawn directions
        directions: (spawn as unknown as { directions?: number[] }).directions ?? [C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT],
        
        spawnCreep: (body: BodyPartType[]) => {
          if (!isMy) return { error: C.ERR_NOT_OWNER };
          self.addIntent(spawn._id, { spawnCreep: { body } });
          return { object: null }; // Will be populated after processing
        },
        
        setDirections: (directions: number[]) => {
          if (!isMy) return C.ERR_NOT_OWNER;
          self.addIntent(spawn._id, { setDirections: { directions } });
          return C.OK;
        }
      };
      
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    if (obj.type === 'tower') {
      const tower = obj as RuntimeTower;
      const isMy = tower.user === this.playerId;
      
      const wrapped: Record<string, unknown> = {
        id: tower._id,
        x: tower.x,
        y: tower.y,
        my: isMy,
        hits: tower.hits,
        hitsMax: tower.hitsMax,
        store: this.wrapStore(tower.store, C.TOWER_CAPACITY),
        cooldown: tower.cooldown,
        exists: true,
        
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
      
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    // Source wrapper
    if (obj.type === 'source') {
      const source = obj as RuntimeSource;
      const wrapped: Record<string, unknown> = {
        id: source._id,
        x: source.x,
        y: source.y,
        energy: source.energy,
        energyCapacity: C.SOURCE_ENERGY_CAPACITY,
        exists: true
      };
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    // Resource wrapper
    if (obj.type === 'energy' || obj.type === 'resource') {
      const resource = obj as RuntimeResource;
      const wrapped: Record<string, unknown> = {
        id: resource._id,
        x: resource.x,
        y: resource.y,
        amount: resource.amount,
        resourceType: C.RESOURCE_ENERGY,
        exists: true
      };
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    // ConstructionSite wrapper
    if (obj.type === 'constructionSite') {
      const site = obj as unknown as { _id: string; x: number; y: number; progress: number; progressTotal: number; structureType: string; user: string };
      const isMy = site.user === this.playerId;
      const wrapped: Record<string, unknown> = {
        id: site._id,
        x: site.x,
        y: site.y,
        progress: site.progress || 0,
        progressTotal: site.progressTotal || 0,
        structureType: site.structureType,
        my: isMy,
        exists: true,
        
        remove: () => {
          if (!isMy) return C.ERR_NOT_OWNER;
          self.addIntent(site._id, { removeConstructionSite: {} });
          return C.OK;
        }
      };
      this.addGameObjectMethods(wrapped, obj, g);
      return wrapped;
    }
    
    // Generic object wrapper (fallback)
    const wrapped: Record<string, unknown> = {
      id: obj._id,
      x: obj.x,
      y: obj.y,
      exists: true
    };
    this.addGameObjectMethods(wrapped, obj, g);
    return wrapped;
  }
  
  /**
   * Add an intent for an object
   */
  private addIntent(objectId: string, intent: Partial<ObjectIntents>): void {
    if (!this.intents.objects[objectId]) {
      this.intents.objects[objectId] = {};
    }
    Object.assign(this.intents.objects[objectId], intent);
  }
}

