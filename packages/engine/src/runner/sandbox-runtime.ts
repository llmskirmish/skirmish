/**
 * Sandbox Runtime
 * 
 * This TypeScript module runs inside the sandbox (vm or isolated-vm).
 * It is bundled at build time into a self-contained IIFE string.
 * 
 * Key features:
 * - Object identity preserved across ticks (same wrapper instance for same game object)
 * - A* pathfinding with proper goal range handling
 * - Full Screeps Arena API (constants, prototypes, methods)
 * 
 * External dependencies (injected by host):
 * - _getObjects(): string - Returns JSON array of serialized objects
 * - _getTicks(): number - Returns current tick number
 * - _getTerrainAt(x, y): number - Returns terrain type at position
 * - _addIntent(objectId, type, data): void - Records an intent
 * - _consoleLog(msg): void - Logs a message
 * - _generateId(): string - Generates a unique ID
 * - _playerId: string - The current player's ID
 */

import { C } from '@skirmish/types';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';

// ============================================
// EXTERNAL CALLBACK DECLARATIONS
// These are injected by the host before running
// ============================================
declare const _getObjects: { applySync(thisArg: undefined, args: []): string };
declare const _getTicks: { applySync(thisArg: undefined, args: []): number };
declare const _getTerrainAt: { applySync(thisArg: undefined, args: [number, number]): number };
declare const _addIntent: { applySync(thisArg: undefined, args: [string, string, string]): void };
declare const _consoleLog: { applySync(thisArg: undefined, args: [string]): void };
declare const _generateId: { applySync(thisArg: undefined, args: []): string };
declare const _playerId: string;

// For vm context (direct function calls)
declare const _getObjectsDirect: (() => string) | undefined;
declare const _getTicksDirect: (() => number) | undefined;
declare const _getTerrainAtDirect: ((x: number, y: number) => number) | undefined;
declare const _addIntentDirect: ((objectId: string, type: string, data: string) => void) | undefined;
declare const _consoleLogDirect: ((msg: string) => void) | undefined;
declare const _generateIdDirect: (() => string) | undefined;

// ============================================
// CALLBACK WRAPPERS (handle both vm and isolated-vm)
// ============================================
function getObjectsFromHost(): string {
  if (typeof _getObjectsDirect === 'function') {
    return _getObjectsDirect();
  }
  return _getObjects.applySync(undefined, []);
}

function getTicksFromHost(): number {
  if (typeof _getTicksDirect === 'function') {
    return _getTicksDirect();
  }
  return _getTicks.applySync(undefined, []);
}

function getTerrainAtFromHost(x: number, y: number): number {
  if (typeof _getTerrainAtDirect === 'function') {
    return _getTerrainAtDirect(x, y);
  }
  return _getTerrainAt.applySync(undefined, [x, y]);
}

function addIntentToHost(objectId: string, type: string, data: string): void {
  if (typeof _addIntentDirect === 'function') {
    _addIntentDirect(objectId, type, data);
    return;
  }
  _addIntent.applySync(undefined, [objectId, type, data]);
}

function consoleLogToHost(msg: string): void {
  if (typeof _consoleLogDirect === 'function') {
    _consoleLogDirect(msg);
    return;
  }
  _consoleLog.applySync(undefined, [msg]);
}

function generateIdFromHost(): string {
  if (typeof _generateIdDirect === 'function') {
    return _generateIdDirect();
  }
  return _generateId.applySync(undefined, []);
}

// ============================================
// CONSTANTS (inlined during bundling)
// ============================================
const ATTACK = C.ATTACK;
const RANGED_ATTACK = C.RANGED_ATTACK;
const HEAL = C.HEAL;
const MOVE = C.MOVE;
const WORK = C.WORK;
const CARRY = C.CARRY;
const TOUGH = C.TOUGH;

const TOP = C.TOP;
const TOP_RIGHT = C.TOP_RIGHT;
const RIGHT = C.RIGHT;
const BOTTOM_RIGHT = C.BOTTOM_RIGHT;
const BOTTOM = C.BOTTOM;
const BOTTOM_LEFT = C.BOTTOM_LEFT;
const LEFT = C.LEFT;
const TOP_LEFT = C.TOP_LEFT;

const TERRAIN_PLAIN = C.TERRAIN_PLAIN;
const TERRAIN_WALL = C.TERRAIN_WALL;
const TERRAIN_SWAMP = C.TERRAIN_SWAMP;

const RESOURCE_ENERGY = C.RESOURCE_ENERGY;

const OK = C.OK;
const ERR_NOT_OWNER = C.ERR_NOT_OWNER;
const ERR_NO_PATH = C.ERR_NO_PATH;
const ERR_BUSY = C.ERR_BUSY;
const ERR_NOT_FOUND = C.ERR_NOT_FOUND;
const ERR_NOT_ENOUGH_RESOURCES = C.ERR_NOT_ENOUGH_RESOURCES;
const ERR_INVALID_TARGET = C.ERR_INVALID_TARGET;
const ERR_FULL = C.ERR_FULL;
const ERR_NOT_IN_RANGE = C.ERR_NOT_IN_RANGE;
const ERR_INVALID_ARGS = C.ERR_INVALID_ARGS;
const ERR_TIRED = C.ERR_TIRED;
const ERR_NO_BODYPART = C.ERR_NO_BODYPART;

const CARRY_CAPACITY = C.CARRY_CAPACITY;
const SPAWN_ENERGY_CAPACITY = C.SPAWN_ENERGY_CAPACITY;
const TOWER_CAPACITY = C.TOWER_CAPACITY;
const SOURCE_ENERGY_CAPACITY = C.SOURCE_ENERGY_CAPACITY;

const ARENA_SIZE = DEFAULT_MAP_SIZE;

// ============================================
// TYPES
// ============================================
interface Position {
  x: number;
  y: number;
}

interface BodyPart {
  type: string;
  hits: number;
}

interface SerializedObject {
  id: string;
  type: string;
  x: number;
  y: number;
  user?: string;
  hits?: number;
  hitsMax?: number;
  fatigue?: number;
  body?: BodyPart[];
  spawning?: unknown;
  store?: Record<string, number>;
  cooldown?: number;
  energy?: number;
  amount?: number;
  progress?: number;
  progressTotal?: number;
  structureType?: string;
}

interface PathGoal {
  pos: Position;
  range?: number;
}

interface PathOptions {
  costMatrix?: CostMatrixType;
  plainCost?: number;
  swampCost?: number;
  range?: number;
}

interface PathResult {
  path: Position[];
  ops: number;
  cost: number;
  incomplete: boolean;
}

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  parent: PathNode | null;
}

interface StoreType {
  _data: Record<string, number>;
  _capacity: number;
  energy: number;
  getCapacity(resource?: string): number | null;
  getUsedCapacity(resource?: string): number;
  getFreeCapacity(resource?: string): number | null;
  _update(newData: Record<string, number>, newBody?: BodyPart[]): void;
}

interface WrappedObject extends Position {
  id: string;
  exists: boolean;
  _type: string;
  user?: string;
  my?: boolean;
  hits?: number;
  hitsMax?: number;
  fatigue?: number;
  body?: BodyPart[];
  spawning?: unknown;
  store?: StoreType;
  cooldown?: number;
  energy?: number;
  energyCapacity?: number;
  amount?: number;
  resourceType?: string;
  progress?: number;
  progressTotal?: number;
  structureType?: string;
  
  // Methods
  getRangeTo?(target: Position | { pos: Position }): number;
  findClosestByRange?<T extends Position>(objects: T[]): T | null;
  findInRange?<T extends Position>(objects: T[], range: number): T[];
  findPathTo?(target: Position, opts?: PathOptions): Position[];
  findClosestByPath?<T extends Position>(objects: T[], opts?: PathOptions): T | null;
  
  // Creep methods
  move?(direction: number): number;
  moveTo?(target: Position, opts?: PathOptions): number;
  attack?(target: { id: string; x?: number; y?: number }): number;
  rangedAttack?(target: { id: string; x?: number; y?: number }): number;
  rangedMassAttack?(): number;
  heal?(target: { id: string; x?: number; y?: number }): number;
  rangedHeal?(target: { id: string; x?: number; y?: number }): number;
  harvest?(target: { id: string; x?: number; y?: number }): number;
  build?(target: { id: string; x?: number; y?: number }): number;
  transfer?(target: { id: string }, resourceType: string, amount?: number): number;
  withdraw?(target: { id: string }, resourceType: string, amount?: number): number;
  drop?(resourceType: string, amount?: number): number;
  pickup?(target: { id: string }): number;
  pull?(target: { id: string }): number;
  
  // Spawn methods
  spawnCreep?(body: string[]): { object: null } | { error: number };
  
  // Tower methods (reuse attack/heal names but different intent types)
}

interface CostMatrixType {
  _bits: Uint8Array;
  set(x: number, y: number, value: number): void;
  get(x: number, y: number): number;
  clone(): CostMatrixType;
}

// ============================================
// PROTOTYPE CLASSES
// ============================================
class Creep {}
class StructureSpawn {}
class StructureTower {}
class Source {}
class Resource {}
class ConstructionSite {}

// ============================================
// OBJECT CACHE - Maintains stable identity across ticks
// ============================================
const _objectCache = new Map<string, WrappedObject>();

// ============================================
// TERRAIN CACHE - Passed once per tick
// ============================================
let _terrainCache: Uint8Array | null = null;
let _currentTick = 0;

function _getTerrainAtCached(x: number, y: number): number {
  if (!_terrainCache) return TERRAIN_PLAIN;
  if (x < 0 || x >= ARENA_SIZE || y < 0 || y >= ARENA_SIZE) return TERRAIN_WALL;
  return _terrainCache[y * ARENA_SIZE + x] || TERRAIN_PLAIN;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getDirection(dx: number, dy: number): number {
  if (dx === 0 && dy < 0) return TOP;
  if (dx > 0 && dy < 0) return TOP_RIGHT;
  if (dx > 0 && dy === 0) return RIGHT;
  if (dx > 0 && dy > 0) return BOTTOM_RIGHT;
  if (dx === 0 && dy > 0) return BOTTOM;
  if (dx < 0 && dy > 0) return BOTTOM_LEFT;
  if (dx < 0 && dy === 0) return LEFT;
  if (dx < 0 && dy < 0) return TOP_LEFT;
  return TOP;
}

function getRange(pos1: Position, pos2: Position): number {
  return Math.max(Math.abs(pos1.x - pos2.x), Math.abs(pos1.y - pos2.y));
}

function findClosestByRange<T extends Position>(pos: Position, objects: T[]): T | null {
  let closest: T | null = null;
  let minRange = Infinity;
  for (const obj of objects) {
    const range = getRange(pos, obj);
    if (range < minRange) {
      minRange = range;
      closest = obj;
    }
  }
  return closest;
}

function findInRange<T extends Position>(pos: Position, objects: T[], range: number): T[] {
  return objects.filter(obj => getRange(pos, obj) <= range);
}

function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= ARENA_SIZE || y < 0 || y >= ARENA_SIZE) return false;
  return _getTerrainAtCached(x, y) !== TERRAIN_WALL;
}

function hasBodyPart(body: BodyPart[] | undefined, partType: string): boolean {
  return body !== undefined && body.some(p => p.type === partType && p.hits > 0);
}

// ============================================
// PATHFINDING (A* implementation)
// ============================================
function searchPath(origin: Position, goalInput: PathGoal | PathGoal[], opts?: PathOptions): PathResult {
  const goals = Array.isArray(goalInput) ? goalInput : [goalInput];
  const plainCost = opts?.plainCost ?? 1;
  const swampCost = opts?.swampCost ?? 5;
  
  // Build set of goal positions (including range)
  const goalSet = new Set<string>();
  for (const g of goals) {
    const range = g.range ?? 0;
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const gx = g.pos.x + dx;
        const gy = g.pos.y + dy;
        if (gx >= 0 && gx < ARENA_SIZE && gy >= 0 && gy < ARENA_SIZE) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) <= range) {
            goalSet.add(gx + ',' + gy);
          }
        }
      }
    }
  }
  
  // Check if already at goal
  if (goalSet.has(origin.x + ',' + origin.y)) {
    return { path: [], ops: 0, cost: 0, incomplete: false };
  }
  
  // A* algorithm
  const openSet: PathNode[] = [{ x: origin.x, y: origin.y, g: 0, h: 0, parent: null }];
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
  
  gScores.set(origin.x + ',' + origin.y, 0);
  
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
    const currentKey = current.x + ',' + current.y;
    
    if (goalSet.has(currentKey)) {
      const path: Position[] = [];
      let node: PathNode | null = current;
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
      const neighborKey = nx + ',' + ny;
      
      if (closedSet.has(neighborKey)) continue;
      if (!isWalkable(nx, ny)) continue;
      
      // Get movement cost - use costMatrix if provided, otherwise terrain
      let moveCost = plainCost;
      const costMatrix = opts?.costMatrix;
      if (costMatrix) {
        const cmCost = costMatrix.get(nx, ny);
        if (cmCost === 255) continue; // Impassable
        if (cmCost > 0) moveCost = cmCost;
      } else {
        const terrain = _getTerrainAtCached(nx, ny);
        if (terrain === TERRAIN_SWAMP) moveCost = swampCost;
      }
      
      const tentativeG = current.g + moveCost;
      const existingG = gScores.get(neighborKey);
      
      if (existingG === undefined || tentativeG < existingG) {
        gScores.set(neighborKey, tentativeG);
        const neighborNode: PathNode = {
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
  
  return { path: [], ops, cost: 0, incomplete: true };
}

function findPath(from: Position, to: Position, opts?: PathOptions): Position[] {
  const range = opts?.range ?? 0;
  const result = searchPath(from, [{ pos: to, range }], opts);
  return result.path;
}

function findClosestByPath<T extends Position>(pos: Position, objects: T[], opts?: PathOptions): T | null {
  let closest: T | null = null;
  let shortestCost = Infinity;
  const range = opts?.range ?? 0;
  
  for (const obj of objects) {
    // Check if already in range
    const dist = getRange(pos, obj);
    if (dist <= range) {
      return obj; // Already at target
    }
    
    const result = searchPath(pos, [{ pos: obj, range }], opts);
    if (!result.incomplete && result.cost < shortestCost) {
      shortestCost = result.cost;
      closest = obj;
    }
  }
  
  return closest;
}

// ============================================
// STORE WRAPPER
// ============================================
function createStore(storeData: Record<string, number> | undefined, objectType: string, body?: BodyPart[]): StoreType {
  const data = storeData || {};
  
  let capacity = 0;
  if (objectType === 'creep' && body) {
    capacity = body.filter(p => p.type === CARRY).length * CARRY_CAPACITY;
  } else if (objectType === 'spawn') {
    capacity = SPAWN_ENERGY_CAPACITY;
  } else if (objectType === 'tower') {
    capacity = TOWER_CAPACITY;
  }
  
  return {
    _data: data,
    _capacity: capacity,
    get energy() { return this._data.energy || 0; },
    getCapacity(resource?: string) {
      if (resource !== undefined) {
        return resource === RESOURCE_ENERGY ? this._capacity : null;
      }
      return this._capacity;
    },
    getUsedCapacity(resource?: string) {
      if (resource !== undefined) {
        return this._data[resource] || 0;
      }
      return Object.values(this._data).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    },
    getFreeCapacity(resource?: string) {
      if (resource !== undefined) {
        if (resource !== RESOURCE_ENERGY) return null;
        return this._capacity - (this._data[resource] || 0);
      }
      const used = Object.values(this._data).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      return this._capacity - used;
    },
    _update(newData: Record<string, number>, newBody?: BodyPart[]) {
      this._data = newData || {};
      // Recalculate capacity for creeps (body parts may be destroyed)
      if (newBody) {
        this._capacity = newBody.filter(p => p.type === CARRY).length * CARRY_CAPACITY;
      }
    }
  };
}

// ============================================
// INTENT HELPER
// ============================================
function addIntent(objectId: string, type: string, data: Record<string, unknown>): void {
  addIntentToHost(objectId, type, JSON.stringify(data));
}

// ============================================
// PROTOTYPE MAP
// ============================================
const _prototypeMap: Record<string, Function> = {
  'creep': Creep,
  'spawn': StructureSpawn,
  'tower': StructureTower,
  'source': Source,
  'energy': Resource,
  'resource': Resource,
  'constructionSite': ConstructionSite
};

// ============================================
// OBJECT WRAPPER CREATION & UPDATE
// ============================================
function _updateWrapper(wrapper: WrappedObject, data: SerializedObject): void {
  wrapper.x = data.x;
  wrapper.y = data.y;
  wrapper.exists = true;
  
  if (data.type === 'creep') {
    wrapper.hits = data.hits;
    wrapper.hitsMax = data.hitsMax;
    wrapper.fatigue = data.fatigue;
    wrapper.body = data.body;
    wrapper.spawning = data.spawning;
    if (wrapper.store) wrapper.store._update(data.store || {}, data.body);
  } else if (data.type === 'spawn') {
    wrapper.hits = data.hits;
    wrapper.hitsMax = data.hitsMax;
    wrapper.spawning = data.spawning;
    if (wrapper.store) wrapper.store._update(data.store || {});
  } else if (data.type === 'tower') {
    wrapper.hits = data.hits;
    wrapper.hitsMax = data.hitsMax;
    wrapper.cooldown = data.cooldown;
    if (wrapper.store) wrapper.store._update(data.store || {});
  } else if (data.type === 'source') {
    wrapper.energy = data.energy;
  } else if (data.type === 'energy' || data.type === 'resource') {
    wrapper.amount = data.amount;
  } else if (data.type === 'constructionSite') {
    wrapper.progress = data.progress;
    wrapper.progressTotal = data.progressTotal;
  }
}

function _createWrapper(data: SerializedObject): WrappedObject {
  const isMy = data.user === _playerId;
  
  const obj: WrappedObject = {
    id: data.id,
    x: data.x,
    y: data.y,
    exists: true,
    _type: data.type,
    user: data.user,
    my: isMy
  };
  
  if (_prototypeMap[data.type]) {
    Object.setPrototypeOf(obj, _prototypeMap[data.type].prototype);
  }
  
  // Add common methods
  obj.getRangeTo = function(target: Position | { pos: Position }) {
    const pos = 'pos' in target ? target.pos : target;
    return getRange(this, pos);
  };
  obj.findClosestByRange = function<T extends Position>(objects: T[]) {
    return findClosestByRange(this, objects);
  };
  obj.findInRange = function<T extends Position>(objects: T[], range: number) {
    return findInRange(this, objects, range);
  };
  obj.findPathTo = function(target: Position, opts?: PathOptions) {
    return findPath(this, target, opts);
  };
  obj.findClosestByPath = function<T extends Position>(objects: T[], opts?: PathOptions) {
    return findClosestByPath(this, objects, opts);
  };
  
  // Type-specific properties and methods
  if (data.type === 'creep') {
    obj.hits = data.hits;
    obj.hitsMax = data.hitsMax;
    obj.fatigue = data.fatigue;
    obj.body = data.body;
    obj.spawning = data.spawning;
    obj.store = createStore(data.store, 'creep', data.body);
    
    obj.move = function(direction: number) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'move', { direction });
      return OK;
    };
    
    obj.moveTo = function(target: Position, opts?: PathOptions) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      
      const range = opts?.range ?? 0;
      const currentRange = getRange(this, target);
      if (currentRange <= range) return OK;
      
      const path = findPath({ x: this.x, y: this.y }, target, { range });
      if (path.length === 0) return ERR_NO_PATH;
      
      const next = path[0];
      const dx = next.x - this.x;
      const dy = next.y - this.y;
      if (dx === 0 && dy === 0) return OK;
      
      addIntent(this.id, 'move', { direction: getDirection(dx, dy) });
      return OK;
    };
    
    obj.attack = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, ATTACK)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 1) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'attack', { id: target.id });
      return OK;
    };
    
    obj.rangedAttack = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, RANGED_ATTACK)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 3) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'rangedAttack', { id: target.id });
      return OK;
    };
    
    obj.rangedMassAttack = function() {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, RANGED_ATTACK)) return ERR_NO_BODYPART;
      addIntent(this.id, 'rangedMassAttack', {});
      return OK;
    };
    
    obj.heal = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, HEAL)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 1) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'heal', { id: target.id });
      return OK;
    };
    
    obj.rangedHeal = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, HEAL)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 3) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'rangedHeal', { id: target.id });
      return OK;
    };
    
    obj.harvest = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, WORK)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 1) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'harvest', { id: target.id });
      return OK;
    };
    
    obj.build = function(target: { id: string; x?: number; y?: number }) {
      if (!isMy) return ERR_NOT_OWNER;
      if (!this.exists) return ERR_NOT_FOUND;
      if (!hasBodyPart(this.body, WORK)) return ERR_NO_BODYPART;
      if (target.x !== undefined && target.y !== undefined) {
        if (getRange(this, target as Position) > 3) return ERR_NOT_IN_RANGE;
      }
      addIntent(this.id, 'build', { id: target.id });
      return OK;
    };
    
    obj.transfer = function(target: { id: string }, resourceType: string, amount?: number) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'transfer', { id: target.id, resourceType, amount });
      return OK;
    };
    
    obj.withdraw = function(target: { id: string }, resourceType: string, amount?: number) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'withdraw', { id: target.id, resourceType, amount });
      return OK;
    };
    
    obj.drop = function(resourceType: string, amount?: number) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'drop', { resourceType, amount });
      return OK;
    };
    
    obj.pickup = function(target: { id: string }) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'pickup', { id: target.id });
      return OK;
    };
    
    obj.pull = function(target: { id: string }) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'pull', { id: target.id });
      return OK;
    };
  } else if (data.type === 'spawn') {
    obj.hits = data.hits;
    obj.hitsMax = data.hitsMax;
    obj.spawning = data.spawning;
    obj.store = createStore(data.store, 'spawn');
    
    obj.spawnCreep = function(body: string[]) {
      if (!isMy) return { error: ERR_NOT_OWNER };
      addIntent(this.id, 'spawnCreep', { body });
      return { object: null };
    };
  } else if (data.type === 'tower') {
    obj.hits = data.hits;
    obj.hitsMax = data.hitsMax;
    obj.cooldown = data.cooldown;
    obj.store = createStore(data.store, 'tower');
    
    // Tower uses different intent names
    obj.attack = function(target: { id: string }) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'towerAttack', { id: target.id });
      return OK;
    };
    obj.heal = function(target: { id: string }) {
      if (!isMy) return ERR_NOT_OWNER;
      addIntent(this.id, 'towerHeal', { id: target.id });
      return OK;
    };
  } else if (data.type === 'source') {
    obj.energy = data.energy;
    obj.energyCapacity = SOURCE_ENERGY_CAPACITY;
  } else if (data.type === 'energy' || data.type === 'resource') {
    obj.amount = data.amount;
    obj.resourceType = RESOURCE_ENERGY;
  } else if (data.type === 'constructionSite') {
    obj.progress = data.progress;
    obj.progressTotal = data.progressTotal;
    obj.structureType = data.structureType;
  }
  
  return obj;
}

// ============================================
// TICK REFRESH
// ============================================
function _refreshObjectCache(): void {
  const rawObjects: SerializedObject[] = JSON.parse(getObjectsFromHost());
  const currentIds = new Set(rawObjects.map(o => o.id));
  
  // Mark destroyed objects
  for (const [id, wrapper] of _objectCache) {
    if (!currentIds.has(id)) {
      wrapper.exists = false;
    }
  }
  
  // Update or create wrappers
  for (const data of rawObjects) {
    let wrapper = _objectCache.get(data.id);
    
    if (wrapper) {
      // Update existing wrapper in place
      _updateWrapper(wrapper, data);
    } else {
      // Create new wrapper
      wrapper = _createWrapper(data);
      _objectCache.set(data.id, wrapper);
    }
  }
}

function _refreshTick(terrainArray: number[], tickNumber: number): void {
  // Cache terrain (passed as array, converted to Uint8Array)
  if (terrainArray && terrainArray.length > 0) {
    _terrainCache = new Uint8Array(terrainArray);
  }
  _currentTick = tickNumber;
  
  // Refresh object cache
  _refreshObjectCache();
}

// ============================================
// COST MATRIX CLASS
// ============================================
class CostMatrix implements CostMatrixType {
  _bits: Uint8Array;
  
  constructor() {
    this._bits = new Uint8Array(ARENA_SIZE * ARENA_SIZE);
  }
  
  set(x: number, y: number, value: number): void {
    this._bits[y * ARENA_SIZE + x] = value;
  }
  
  get(x: number, y: number): number {
    return this._bits[y * ARENA_SIZE + x];
  }
  
  clone(): CostMatrix {
    const cm = new CostMatrix();
    cm._bits.set(this._bits);
    return cm;
  }
}

// ============================================
// VISUAL CLASS (stub for debug graphics)
// ============================================
class Visual {
  private layer: number;
  private persistent: boolean;
  
  constructor(layer = 0, persistent = false) {
    this.layer = layer;
    this.persistent = persistent;
  }
  
  circle(_pos: Position, _style?: object): this { return this; }
  line(_pos1: Position, _pos2: Position, _style?: object): this { return this; }
  rect(_pos: Position, _w: number, _h: number, _style?: object): this { return this; }
  poly(_points: Position[], _style?: object): this { return this; }
  text(_text: string, _pos: Position, _style?: object): this { return this; }
  clear(): this { return this; }
  get size(): number { return 0; }
}

// ============================================
// MAIN API FUNCTIONS
// ============================================
const console = {
  log: (...args: unknown[]) => consoleLogToHost(args.map(a => String(a)).join(' '))
};

function getObjectsByPrototype<T>(prototype: new () => T): T[] {
  const results: T[] = [];
  for (const [, wrapper] of _objectCache) {
    if (!wrapper.exists) continue;
    
    let matches = false;
    if (prototype === Creep as unknown && wrapper._type === 'creep') matches = true;
    if (prototype === StructureSpawn as unknown && wrapper._type === 'spawn') matches = true;
    if (prototype === StructureTower as unknown && wrapper._type === 'tower') matches = true;
    if (prototype === Source as unknown && wrapper._type === 'source') matches = true;
    if (prototype === Resource as unknown && (wrapper._type === 'energy' || wrapper._type === 'resource')) matches = true;
    if (prototype === ConstructionSite as unknown && wrapper._type === 'constructionSite') matches = true;
    
    if (matches) results.push(wrapper as unknown as T);
  }
  return results;
}

function getObjects(): WrappedObject[] {
  return Array.from(_objectCache.values()).filter(w => w.exists);
}

function getObjectById(id: string): WrappedObject | null {
  const wrapper = _objectCache.get(id);
  return wrapper && wrapper.exists ? wrapper : null;
}

function getTicks(): number {
  return _currentTick;
}

function getTerrainAt(pos: Position): number {
  return _getTerrainAtCached(pos.x, pos.y);
}

function createConstructionSite(pos: Position, structureType: string): { object: null } | { error: number } {
  const id = generateIdFromHost();
  addIntent('global', 'createConstructionSite', { x: pos.x, y: pos.y, structureType, id });
  return { object: null };
}

function getCpuTime(): number {
  return 0; // Not tracked in sandbox
}

// ============================================
// EXPORT TO GLOBAL
// ============================================
// Use globalThis which works in both vm and isolated-vm contexts
// In vm context, this is the sandbox object itself
// In isolated-vm, global is set up by the host
declare const global: Record<string, unknown> | undefined;
declare const self: Record<string, unknown> | undefined;

const _global: Record<string, unknown> = 
  typeof globalThis !== 'undefined' ? globalThis as Record<string, unknown> : 
  typeof global !== 'undefined' ? global : 
  typeof self !== 'undefined' ? self : 
  {};

Object.assign(_global, {
  // Prototypes
  Creep, StructureSpawn, StructureTower, Source, Resource, ConstructionSite,
  // Classes
  CostMatrix, Visual,
  // Constants
  ATTACK, RANGED_ATTACK, HEAL, MOVE, WORK, CARRY, TOUGH,
  TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT,
  TERRAIN_PLAIN, TERRAIN_WALL, TERRAIN_SWAMP, RESOURCE_ENERGY,
  OK, ERR_NOT_OWNER, ERR_NO_PATH, ERR_BUSY, ERR_NOT_FOUND, ERR_NOT_ENOUGH_RESOURCES,
  ERR_INVALID_TARGET, ERR_FULL, ERR_NOT_IN_RANGE, ERR_INVALID_ARGS, ERR_TIRED, ERR_NO_BODYPART,
  // Functions
  getObjectsByPrototype, getObjects, getObjectById, getTicks, getTerrainAt,
  getDirection, getRange, findClosestByRange, findInRange,
  findPath, findClosestByPath, searchPath,
  createConstructionSite, getCpuTime,
  console,
  // Internal (called by host before each loop)
  _refreshTick,
  _refreshObjectCache
});
