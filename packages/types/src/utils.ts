import type { Position, GameObject, Structure, ConstructionSite } from './prototypes/index.js';
import type { SearchPathOptions } from './path-finder.js';
import { searchPath } from './path-finder.js';
import { 
  TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT,
  TERRAIN_PLAIN, TERRAIN_WALL, TERRAIN_SWAMP,
  ERR_INVALID_ARGS, ERR_INVALID_TARGET, ERR_FULL, OK
} from './constants.js';

// Performance timer - uses Date.now() for portability
const getPerformanceNow = (): number => Date.now();

/**
 * Direction type
 */
export type Direction =
  | typeof TOP
  | typeof TOP_RIGHT
  | typeof RIGHT
  | typeof BOTTOM_RIGHT
  | typeof BOTTOM
  | typeof BOTTOM_LEFT
  | typeof LEFT
  | typeof TOP_LEFT;

/**
 * Terrain type
 */
export type Terrain =
  | typeof TERRAIN_WALL
  | typeof TERRAIN_SWAMP
  | typeof TERRAIN_PLAIN;

/**
 * Does zap code space flag
 */
export type DoesZapCodeSpaceFlag = 0 | 1;

/**
 * Heap statistics info
 */
export interface HeapInfo {
  total_heap_size: number;
  total_heap_size_executable: number;
  total_physical_size: number;
  total_available_size: number;
  used_heap_size: number;
  heap_size_limit: number;
  malloced_memory: number;
  peak_malloced_memory: number;
  does_zap_garbage: DoesZapCodeSpaceFlag;
  number_of_native_contexts: number;
  number_of_detached_contexts: number;
  externally_allocated_size: number;
}

/**
 * Find path options
 */
export type FindPathOptions = SearchPathOptions & { 
  ignore?: GameObject[] 
};

/**
 * Create construction site result
 */
export interface CreateConstructionSiteResult {
  /** The instance of ConstructionSite created by this call */
  object?: ConstructionSite;

  /** The error code */
  error?: typeof ERR_INVALID_ARGS | typeof ERR_INVALID_TARGET | typeof ERR_FULL | typeof OK;
}

/**
 * Runtime context interface for utility functions
 */
export interface RuntimeContext {
  objects: Map<string, GameObject>;
  terrain: Uint8Array | null;
  arenaWidth: number;
  arenaHeight: number;
  tick: number;
  startTime: number;
  addConstructionSite?: (pos: Position, type: string) => CreateConstructionSiteResult;
}

// Global runtime context - set by the engine/runtime
let _context: RuntimeContext | null = null;

/**
 * Set the runtime context for utility functions
 */
export function setRuntimeContext(context: RuntimeContext | null): void {
  _context = context;
}

/**
 * Get the current runtime context
 */
export function getRuntimeContext(): RuntimeContext | null {
  return _context;
}

/**
 * Create new ConstructionSite at the specified location.
 */
export function createConstructionSite<T extends Structure>(
  pos: Position, 
  structurePrototype: { new(): T }
): CreateConstructionSiteResult {
  if (!_context) {
    return { error: ERR_INVALID_ARGS };
  }
  
  if (_context.addConstructionSite) {
    const typeName = (structurePrototype as unknown as { _typeName?: string })._typeName || 'unknown';
    return _context.addConstructionSite(pos, typeName);
  }
  
  return { error: ERR_INVALID_TARGET };
}

/**
 * Find a position with the shortest path from the given position.
 */
export function findClosestByPath<T extends Position>(
  fromPos: Position, 
  positions: T[], 
  options?: FindPathOptions
): T | null {
  if (positions.length === 0) return null;
  
  let closest: T | null = null;
  let minCost = Infinity;
  
  for (const pos of positions) {
    const result = searchPath(fromPos, pos, options);
    if (!result.incomplete && result.cost < minCost) {
      minCost = result.cost;
      closest = pos;
    }
  }
  
  return closest;
}

/**
 * Find a position with the shortest linear distance from the given position.
 */
export function findClosestByRange<T extends Position>(fromPos: Position, positions: T[]): T | null {
  let minRange = Infinity;
  let closest: T | null = null;
  
  for (const pos of positions) {
    const range = getRange(fromPos, pos);
    if (range < minRange) {
      minRange = range;
      closest = pos;
    }
  }
  
  return closest;
}

/**
 * Find all objects in the specified linear range.
 */
export function findInRange<T extends Position>(fromPos: Position, positions: T[], range: number): T[] {
  return positions.filter(pos => getRange(fromPos, pos) <= range);
}

/**
 * Find an optimal path between fromPos and toPos.
 */
export function findPath(
  fromPos: Position, 
  toPos: Position, 
  options?: FindPathOptions
): Position[] {
  const result = searchPath(fromPos, toPos, options);
  return result.path;
}

/**
 * Returns CPU wall time elapsed in the current tick in nanoseconds.
 */
export function getCpuTime(): number {
  if (!_context) return 0;
  return (getPerformanceNow() - _context.startTime) * 1_000_000; // Convert ms to ns
}

/**
 * Get linear direction by differences of x and y.
 * Returns TOP (1) if both dx and dy are 0.
 */
export function getDirection(dx: number, dy: number): Direction {
  // Handle zero case - no movement means no direction, default to TOP
  if (dx === 0 && dy === 0) return TOP;
  
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  
  if (adx > ady * 2) {
    if (dx > 0) return RIGHT;
    return LEFT;
  } else if (ady > adx * 2) {
    if (dy > 0) return BOTTOM;
    return TOP;
  } else {
    if (dx > 0 && dy > 0) return BOTTOM_RIGHT;
    if (dx > 0 && dy < 0) return TOP_RIGHT;
    if (dx < 0 && dy > 0) return BOTTOM_LEFT;
    return TOP_LEFT;
  }
}

/**
 * Use this method to get heap statistics for your virtual machine.
 */
export function getHeapStatistics(): HeapInfo {
  // Return placeholder values - would need V8 internals in production
  return {
    total_heap_size: 0,
    total_heap_size_executable: 0,
    total_physical_size: 0,
    total_available_size: 0,
    used_heap_size: 0,
    heap_size_limit: 0,
    malloced_memory: 0,
    peak_malloced_memory: 0,
    does_zap_garbage: 0,
    number_of_native_contexts: 0,
    number_of_detached_contexts: 0,
    externally_allocated_size: 0,
  };
}

/**
 * Get an object with the specified unique ID.
 */
export function getObjectById(id: string | number): GameObject | null {
  if (!_context) return null;
  return _context.objects.get(String(id)) || null;
}

/**
 * Get all game objects in the game.
 */
export function getObjects(): GameObject[] {
  if (!_context) return [];
  return Array.from(_context.objects.values());
}

/**
 * Get all objects in the game with the specified prototype.
 * 
 * Usage: getObjectsByPrototype(Creep) returns all creeps
 */
export function getObjectsByPrototype<T extends GameObject>(
  prototype: { new(): T; _typeName?: string }
): T[] {
  if (!_context) return [];
  
  const typeName = prototype._typeName;
  if (!typeName) return [];
  
  const results: T[] = [];
  for (const obj of _context.objects.values()) {
    if (obj.type === typeName) {
      results.push(obj as T);
    }
  }
  
  return results;
}

/**
 * Get linear range between two objects.
 */
export function getRange(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Get an integer representation of the terrain at the given position.
 */
export function getTerrainAt(pos: Position): Terrain {
  if (!_context || !_context.terrain) return TERRAIN_PLAIN;
  
  const { x, y } = pos;
  if (x < 0 || x >= _context.arenaWidth || y < 0 || y >= _context.arenaHeight) {
    return TERRAIN_WALL;
  }
  
  const value = _context.terrain[y * _context.arenaWidth + x];
  if (value === TERRAIN_WALL) return TERRAIN_WALL;
  if (value === TERRAIN_SWAMP) return TERRAIN_SWAMP;
  return TERRAIN_PLAIN;
}

/**
 * Returns the number of ticks passed from the start of the current game.
 */
export function getTicks(): number {
  if (!_context) return 0;
  return _context.tick;
}
