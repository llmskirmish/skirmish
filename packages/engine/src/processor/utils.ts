import { 
  C, 
  type BodyPartType, 
  type DirectionConstant,
  MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, TOUGH,
  getDirection
} from '@skirmish/types';

// Re-export getDirection from centralized location
export { getDirection };
import type { RuntimeCreep, RuntimeObject, TerrainData, RuntimeBodyPart } from '../driver/types.js';

/** Direction offsets: [dx, dy] for each direction (index 1-8) */
const DIRECTION_OFFSETS: Array<[number, number] | undefined> = [
  undefined, // 0 - not used
  [0, -1],   // 1 - TOP
  [1, -1],   // 2 - TOP_RIGHT
  [1, 0],    // 3 - RIGHT
  [1, 1],    // 4 - BOTTOM_RIGHT
  [0, 1],    // 5 - BOTTOM
  [-1, 1],   // 6 - BOTTOM_LEFT
  [-1, 0],   // 7 - LEFT
  [-1, -1]   // 8 - TOP_LEFT
];

/**
 * Get offsets for a direction
 */
export function getOffsetsByDirection(direction: DirectionConstant): [number, number] {
  const offset = DIRECTION_OFFSETS[direction];
  if (!offset) {
    throw new Error(`Invalid direction: ${direction}`);
  }
  return offset;
}

/**
 * Calculate distance between two positions (Chebyshev distance)
 */
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Check terrain at position
 */
export function checkTerrain(terrain: TerrainData, x: number, y: number, mask: number): boolean {
  const code = terrain.data[y * terrain.width + x];
  return (code & mask) > 0;
}

/**
 * Calculate body part effectiveness for a specific action
 * 
 * Following Screeps pattern: if withoutOldHits is false (default), a body part
 * is considered functional if it has hits > 0 OR had _oldHits > 0 at tick start.
 * This allows creeps to complete actions even if damaged mid-tick.
 * 
 * @param body - Array of body parts
 * @param bodyPartType - The type of body part to count
 * @param _methodName - Method name (for boost lookup, not used in Arena basic mode)
 * @param basePower - Base power per body part
 * @param withoutOldHits - If true, only count parts with current hits > 0
 */
export function calcBodyEffectiveness(
  body: Array<{ type: BodyPartType; hits: number; _oldHits?: number }>,
  bodyPartType: BodyPartType,
  _methodName: string,
  basePower: number,
  withoutOldHits: boolean = false
): number {
  let power = 0;
  for (const part of body) {
    // Screeps pattern: part is functional if hits > 0, or if _oldHits > 0 (unless withoutOldHits)
    const isFunctional = part.hits > 0 || (!withoutOldHits && (part._oldHits ?? 0) > 0);
    if (!isFunctional || part.type !== bodyPartType) {
      continue;
    }
    // No boosts in Arena basic mode
    power += basePower;
  }
  return power;
}

/**
 * Recalculate body part hits from total hits (Screeps pattern)
 * 
 * This function:
 * 1. Preserves _oldHits (original hits at tick start) if not already set
 * 2. Distributes total hits across body parts from end to start
 * 3. Recalculates store capacity based on current functional CARRY parts
 * 
 * @param creep - The creep to recalculate
 */
export function recalcBody(creep: RuntimeCreep): void {
  let hits = creep.hits;
  
  // Iterate from end to start (damage is applied to back parts first in Screeps)
  for (let i = creep.body.length - 1; i >= 0; i--) {
    const part = creep.body[i];
    
    // Preserve original hits if not already set (Screeps pattern)
    if (part._oldHits === undefined) {
      part._oldHits = part.hits;
    }
    
    // Distribute hits to this part (max 100 per part)
    if (hits > C.BODYPART_HITS) {
      part.hits = C.BODYPART_HITS;
    } else {
      part.hits = Math.max(0, hits);
    }
    hits -= C.BODYPART_HITS;
    if (hits < 0) hits = 0;
  }
  
  // Recalculate store capacity based on current functional CARRY parts
  // Use withoutOldHits=true because capacity should reflect current state
  creep.storeCapacity = calcBodyEffectiveness(creep.body, CARRY, 'capacity', C.CARRY_CAPACITY, true);
}

/**
 * Clear _oldHits from all body parts (called at end of tick)
 */
export function clearOldHits(creep: RuntimeCreep): void {
  for (const part of creep.body) {
    delete part._oldHits;
  }
}

/**
 * Calculate creep cost from body parts
 */
export function calcCreepCost(body: BodyPartType[]): number {
  let cost = 0;
  for (const part of body) {
    const partCost = C.BODYPART_COST[part];
    if (partCost === undefined) {
      throw new Error(`Invalid body part: ${part}`);
    }
    cost += partCost;
  }
  return cost;
}

/**
 * Calculate total resources in a creep's store
 */
export function calcResources(object: RuntimeCreep): number {
  if (!object.store) return 0;
  
  let total = 0;
  // Store is now a simple Record<string, number>
  for (const key in object.store) {
    const value = object.store[key];
    if (typeof value === 'number') {
      total += value;
    }
  }
  return total;
}

/**
 * Calculate creep's store capacity
 */
export function calcStoreCapacity(body: Array<{ type: BodyPartType; hits: number }>): number {
  let capacity = 0;
  for (const part of body) {
    if (part.hits > 0 && part.type === CARRY) {
      capacity += C.CARRY_CAPACITY;
    }
  }
  return capacity;
}

/**
 * Calculate fatigue for movement
 */
export function calcFatigue(
  body: Array<{ type: BodyPartType; hits: number }>, 
  resourceWeight: number,
  terrainMultiplier: number
): number {
  // Count non-move, non-carry body parts
  let weight = 0;
  for (const part of body) {
    if (part.type !== MOVE && part.type !== CARRY) {
      weight++;
    }
  }
  weight += resourceWeight;
  return weight * terrainMultiplier;
}

/**
 * Calculate move power (fatigue reduction)
 */
export function calcMovePower(body: Array<{ type: BodyPartType; hits: number }>): number {
  let power = 0;
  for (const part of body) {
    if (part.hits > 0 && part.type === MOVE) {
      power += 1; // Each MOVE reduces fatigue by 2 per tick in Arena
    }
  }
  return power * 2;
}

/**
 * Check if an object type is an obstacle
 */
export function isObstacle(type: string): boolean {
  return C.OBSTACLE_OBJECT_TYPES.includes(type);
}

/**
 * Deep merge utility - merges source into target recursively
 * Similar to lodash _.merge
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  for (const key in source) {
    const sourceVal = source[key];
    const targetVal = (target as Record<string, unknown>)[key];
    
    if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
        targetVal !== null && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
      // Both are objects - recurse
      deepMerge(targetVal as object, sourceVal as object);
    } else {
      // Overwrite
      (target as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return target;
}

