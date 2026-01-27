import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeTower, RuntimeCreep, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { dist } from '../../utils.js';

export interface TowerHealScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Calculate tower heal based on distance
 */
function calcTowerHeal(range: number): number {
  if (range <= C.TOWER_OPTIMAL_RANGE) {
    return C.TOWER_POWER_HEAL;
  }
  
  if (range >= C.TOWER_FALLOFF_RANGE) {
    return Math.floor(C.TOWER_POWER_HEAL * (1 - C.TOWER_FALLOFF));
  }
  
  // Linear falloff
  const falloffDistance = range - C.TOWER_OPTIMAL_RANGE;
  const falloffRange = C.TOWER_FALLOFF_RANGE - C.TOWER_OPTIMAL_RANGE;
  const falloffMultiplier = 1 - (falloffDistance / falloffRange) * C.TOWER_FALLOFF;
  
  return Math.floor(C.TOWER_POWER_HEAL * falloffMultiplier);
}

/**
 * Process tower heal intent
 */
export function processTowerHeal(
  tower: RuntimeTower,
  intent: ObjectIntents['towerHeal'],
  scope: TowerHealScope
): void {
  if (!intent?.id) return;
  if (tower.type !== 'tower') return;
  
  // Check cooldown
  if (tower.cooldown > 0) return;
  
  // Check energy
  const store = tower.store as unknown as Record<string, number>;
  if (!store.energy || store.energy < C.TOWER_ENERGY_COST) return;
  
  const { roomObjects, bulk, events } = scope;
  
  // Get target
  const target = roomObjects.get(intent.id);
  if (!target || target.type !== 'creep') return;
  
  const targetCreep = target as RuntimeCreep;
  if (targetCreep.spawning) return;
  
  // Check range
  const range = dist(tower, target);
  if (range > C.TOWER_RANGE) return;
  
  // Calculate heal amount
  const healAmount = calcTowerHeal(range);
  
  // Apply healing (accumulated for tick processing)
  targetCreep._healToApply = (targetCreep._healToApply || 0) + healAmount;
  
  // Set actionLog on tower and target (Screeps pattern)
  if (tower.actionLog) {
    tower.actionLog.heal = { x: target.x, y: target.y };
  }
  if (targetCreep.actionLog) {
    targetCreep.actionLog.healed = { x: tower.x, y: tower.y };
  }
  
  // Use energy and set cooldown
  store.energy -= C.TOWER_ENERGY_COST;
  tower.cooldown = C.TOWER_COOLDOWN;
  
  bulk.update(tower, { 
    store: { energy: store.energy }, 
    cooldown: tower.cooldown 
  } as Partial<RuntimeObject>);
  
  events.push({
    type: C.EVENT_HEAL,
    objectId: tower._id,
    data: { targetId: target._id, amount: healAmount }
  });
}

