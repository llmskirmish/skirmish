/**
 * Map loading and terrain utilities
 * 
 * Shared utilities for loading map data from JSON files,
 * converting terrain to engine format, and creating initial objects.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { IdGenerator } from '../driver/IdGenerator.js';
import type { RuntimeObject } from '../driver/types.js';
import { 
  type MapData, 
  convertMapToTerrainUint8,
  TERRAIN_PLAIN,
  TERRAIN_WALL,
  TERRAIN_SWAMP,
  DEFAULT_MAP_SIZE,
} from '@skirmish/maps';

// Re-export types for backwards compatibility
export type { MapData } from '@skirmish/maps';
export { TERRAIN_PLAIN, TERRAIN_WALL, TERRAIN_SWAMP } from '@skirmish/maps';

/**
 * Load a single map from a JSON file
 * 
 * @param name - Map name (without .json extension)
 * @param mapsDir - Directory containing map files
 * @returns Map data
 * @throws Error if map file not found
 */
export function loadMap(name: string, mapsDir: string): MapData {
  const mapPath = join(mapsDir, `${name}.json`);
  if (!existsSync(mapPath)) {
    const available = readdirSync(mapsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    throw new Error(`Map "${name}" not found. Available maps: ${available.join(', ')}`);
  }
  const content = readFileSync(mapPath, 'utf-8');
  return JSON.parse(content) as MapData;
}

/**
 * Load all maps from a directory
 * 
 * @param mapsDir - Directory containing map JSON files
 * @returns Record of map name to map data
 */
export function loadMaps(mapsDir: string): Record<string, MapData> {
  const maps: Record<string, MapData> = {};
  
  const files = readdirSync(mapsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const name = file.replace('.json', '');
    const content = readFileSync(join(mapsDir, file), 'utf-8');
    maps[name] = JSON.parse(content) as MapData;
  }
  
  return maps;
}

/**
 * Convert map walls/swamps to engine terrain format (Uint8Array)
 * 
 * @param map - Map data containing walls and swamps
 * @param size - Arena size (default: DEFAULT_MAP_SIZE, maps are square)
 * @returns Terrain data in engine format
 */
export function convertTerrain(map: MapData, size = DEFAULT_MAP_SIZE) {
  return convertMapToTerrainUint8(map, size);
}

/**
 * Create runtime objects from map initial objects with generated IDs
 * 
 * @param map - Map data containing initial objects
 * @returns Array of runtime objects with assigned IDs
 */
export function createInitialObjects(map: MapData): RuntimeObject[] {
  const idGen = new IdGenerator();
  
  return map.initialObjects.map(obj => {
    const _id = idGen.generateId();
    return { ...obj, _id } as RuntimeObject;
  });
}

