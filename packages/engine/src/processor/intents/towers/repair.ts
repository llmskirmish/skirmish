import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeTower, BulkOperation, GameEvent, RuntimeStructure } from '../../../driver/types.js';
import { dist } from '../../utils.js';

export interface TowerRepairScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Calculate tower effectiveness based on distance
 */
function getTowerEffectiveness(tower: RuntimeTower, target: RuntimeObject): number {
  const range = dist(tower, target);
  
  if (range <= C.TOWER_OPTIMAL_RANGE) {
    return 1;
  }
  
  if (range >= C.TOWER_FALLOFF_RANGE) {
    return 1 - C.TOWER_FALLOFF;
  }
  
  // Linear falloff between optimal and falloff range
  const falloffRange = C.TOWER_FALLOFF_RANGE - C.TOWER_OPTIMAL_RANGE;
  const falloffDistance = range - C.TOWER_OPTIMAL_RANGE;
  return 1 - (C.TOWER_FALLOFF * (falloffDistance / falloffRange));
}

/**
 * Process tower repair intent
 */
export function processTowerRepair(
  tower: RuntimeTower,
  intent: { id: string },
  scope: TowerRepairScope
): void {
  if (!intent?.id) return;
  if (tower.type !== 'tower') return;

  const { roomObjects, bulk, events } = scope;

  // Check tower cooldown
  if (tower.cooldown && tower.cooldown > 0) return;

  // Check tower energy
  const energy = tower.store?.[C.RESOURCE_ENERGY] || 0;
  if (energy < C.TOWER_ENERGY_COST) return;

  // Get target structure
  const target = roomObjects.get(intent.id) as RuntimeStructure | undefined;
  if (!target) return;

  // Check if target has hits and can be repaired
  if (!('hits' in target) || !('hitsMax' in target)) return;
  if (target.hits >= target.hitsMax) return;

  // Check range
  if (dist(tower, target) > C.TOWER_RANGE) return;

  // Calculate repair power with distance falloff
  const effectiveness = getTowerEffectiveness(tower, target);
  const repairPower = Math.floor(C.TOWER_POWER_REPAIR * effectiveness);

  if (repairPower === 0) return;

  // Calculate actual repair amount
  const maxRepair = target.hitsMax - target.hits;
  const actualRepair = Math.min(repairPower, maxRepair);

  // Deduct energy from tower
  tower.store[C.RESOURCE_ENERGY] = energy - C.TOWER_ENERGY_COST;
  bulk.update(tower, { store: tower.store, cooldown: C.TOWER_COOLDOWN });

  // Apply repair to target
  target.hits = Math.min(target.hits + actualRepair, target.hitsMax);
  bulk.update(target, { hits: target.hits });

  // Set actionLog on tower (Screeps pattern)
  if (tower.actionLog) {
    tower.actionLog.repair = { x: target.x, y: target.y };
  }

  events.push({
    type: C.EVENT_REPAIR,
    objectId: tower._id,
    data: { targetId: target._id, amount: actualRepair }
  });
}

