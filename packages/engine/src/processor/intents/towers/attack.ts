import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeTower, RuntimeCreep, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { dist } from '../../utils.js';
import { applyDamage, findRampartAt, EVENT_ATTACK_TYPE_RANGED } from '../damage.js';

export interface TowerAttackScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Calculate tower damage based on distance
 */
function calcTowerDamage(range: number): number {
  if (range <= C.TOWER_OPTIMAL_RANGE) {
    return C.TOWER_POWER_ATTACK;
  }
  
  if (range >= C.TOWER_FALLOFF_RANGE) {
    return Math.floor(C.TOWER_POWER_ATTACK * (1 - C.TOWER_FALLOFF));
  }
  
  // Linear falloff
  const falloffDistance = range - C.TOWER_OPTIMAL_RANGE;
  const falloffRange = C.TOWER_FALLOFF_RANGE - C.TOWER_OPTIMAL_RANGE;
  const falloffMultiplier = 1 - (falloffDistance / falloffRange) * C.TOWER_FALLOFF;
  
  return Math.floor(C.TOWER_POWER_ATTACK * falloffMultiplier);
}

/**
 * Process tower attack intent
 */
export function processTowerAttack(
  tower: RuntimeTower,
  intent: ObjectIntents['towerAttack'],
  scope: TowerAttackScope
): void {
  if (!intent?.id) return;
  if (tower.type !== 'tower') return;
  
  // Check cooldown
  if (tower.cooldown > 0) return;
  
  // Check energy
  const store = tower.store as unknown as Record<string, number>;
  if (!store.energy || store.energy < C.TOWER_ENERGY_COST) return;
  
  const { roomObjects, bulk } = scope;
  
  // Get target
  let target = roomObjects.get(intent.id);
  if (!target) return;
  
  // Check range
  const range = dist(tower, target);
  if (range > C.TOWER_RANGE) return;
  
  // Check if target is spawning creep
  if (target.type === 'creep' && (target as RuntimeCreep).spawning) return;
  
  // Check if target has hits
  if (!('hits' in target) || !(target as { hits: number }).hits) return;
  
  // Check for rampart
  const rampart = findRampartAt(target.x, target.y, roomObjects);
  if (rampart) {
    target = rampart;
  }
  
  // Calculate damage
  const damage = calcTowerDamage(range);
  
  // Apply damage
  applyDamage(tower, target, damage, EVENT_ATTACK_TYPE_RANGED, scope);
  
  // Use energy and set cooldown
  store.energy -= C.TOWER_ENERGY_COST;
  tower.cooldown = C.TOWER_COOLDOWN;
  
  bulk.update(tower, { 
    store: { energy: store.energy }, 
    cooldown: tower.cooldown 
  } as Partial<RuntimeObject>);
}

