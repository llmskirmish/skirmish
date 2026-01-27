/**
 * @skirmish/maps - Map types and utilities
 * 
 * Shared between engine (Node.js) and frontend (browser).
 * Contains only pure functions and types - no platform-specific code.
 */

// ============================================
// Terrain Constants
// ============================================

/** Plain/walkable terrain */
export const TERRAIN_PLAIN = 0;
/** Wall/unwalkable terrain */
export const TERRAIN_WALL = 1;
/** Swamp terrain (slows movement) */
export const TERRAIN_SWAMP = 2;

/** Default map size (maps are always square) */
export const DEFAULT_MAP_SIZE = 100;

// ============================================
// Types
// ============================================

/**
 * Terrain data in array format (for rendering/serialization)
 */
export interface TerrainData {
  width: number;
  height: number;
  data: number[];
}

/**
 * Map color scheme
 */
export interface MapColors {
  floor: string;
  wall: string;
  wallHighlight: string;
  swamp: string;
  swampDark: string;
}

/**
 * Map data as stored in JSON files
 */
export interface MapData {
  name: string;
  colors?: MapColors;
  walls: Array<{ x: number; y: number }>;
  swamps: Array<{ x: number; y: number }>;
  initialObjects: Array<Record<string, unknown>>;
}

// ============================================
// Conversion Functions
// ============================================

/**
 * Convert map walls/swamps to terrain data format
 * 
 * Pure function - works in Node.js and browser.
 * Returns number[] array (not Uint8Array) for JSON serialization compatibility.
 * 
 * @param map - Map data containing walls and swamps
 * @param size - Arena size (default: DEFAULT_MAP_SIZE, maps are square)
 * @returns Terrain data with number[] array
 */
export function convertMapToTerrain(map: MapData, size = DEFAULT_MAP_SIZE): TerrainData {
  const width = size;
  const height = size;
  const data = new Array<number>(width * height).fill(TERRAIN_PLAIN);

  // Set walls
  for (const { x, y } of map.walls) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      data[y * width + x] = TERRAIN_WALL;
    }
  }

  // Set swamps (only on plain terrain)
  for (const { x, y } of map.swamps) {
    if (x >= 0 && x < width && y >= 0 && y < height && data[y * width + x] === TERRAIN_PLAIN) {
      data[y * width + x] = TERRAIN_SWAMP;
    }
  }

  return { width, height, data };
}

/**
 * Convert map walls/swamps to Uint8Array terrain format
 * 
 * More memory-efficient version for engine use.
 * 
 * @param map - Map data containing walls and swamps  
 * @param size - Arena size (default: DEFAULT_MAP_SIZE, maps are square)
 * @returns Terrain data with Uint8Array
 */
export function convertMapToTerrainUint8(
  map: MapData, 
  size = DEFAULT_MAP_SIZE
): { width: number; height: number; data: Uint8Array } {
  const width = size;
  const height = size;
  const data = new Uint8Array(width * height);

  // Set walls
  for (const { x, y } of map.walls) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      data[y * width + x] = TERRAIN_WALL;
    }
  }

  // Set swamps (only on plain terrain)
  for (const { x, y } of map.swamps) {
    if (x >= 0 && x < width && y >= 0 && y < height && data[y * width + x] === TERRAIN_PLAIN) {
      data[y * width + x] = TERRAIN_SWAMP;
    }
  }

  return { width, height, data };
}

// ============================================
// Initial Objects
// ============================================

/**
 * Object with an ID (minimum shape for game objects)
 */
export interface GameObjectBase {
  _id: string;
  type: string;
  x: number;
  y: number;
  user?: string;
  [key: string]: unknown;
}

/**
 * Convert map initial objects to game objects with generated IDs
 * 
 * @param map - Map data containing initial objects
 * @param idPrefix - Prefix for generated IDs (default: 'obj')
 * @returns Array of objects with assigned IDs
 */
export function convertInitialObjects(map: MapData, idPrefix = 'obj'): GameObjectBase[] {
  let counter = 1;
  
  return map.initialObjects.map((obj) => ({
    ...obj,
    _id: `${idPrefix}-${counter++}`,
    type: obj.type as string,
    x: obj.x as number,
    y: obj.y as number,
  })) as GameObjectBase[];
}
