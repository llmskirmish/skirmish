import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent, RuntimeStructure } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface RepairScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep repair intent
 */
export function processRepair(
  creep: RuntimeCreep,
  intent: { id: string },
  scope: RepairScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target structure
  const target = roomObjects.get(intent.id) as RuntimeStructure | undefined;
  if (!target) return;

  // Check if target has hits and can be repaired
  if (!('hits' in target) || !('hitsMax' in target)) return;
  if (target.hits >= target.hitsMax) return;

  // Check range (must be within 3 squares)
  if (dist(creep, target) > 3) return;

  // Check for WORK body parts
  const repairPower = calcBodyEffectiveness(creep.body, C.WORK, 'repair', C.REPAIR_POWER);
  if (repairPower === 0) return;

  // Check if creep has energy
  const energy = creep.store?.[C.RESOURCE_ENERGY] || 0;
  if (energy === 0) return;

  // Calculate repair cost and actual repair amount
  const maxRepair = target.hitsMax - target.hits;
  const repairAmount = Math.min(repairPower, maxRepair);
  const energyCost = Math.ceil(repairAmount * C.REPAIR_COST);
  
  if (energyCost > energy) {
    // Not enough energy for full repair
    const adjustedRepair = Math.floor(energy / C.REPAIR_COST);
    if (adjustedRepair === 0) return;
    
    creep.store[C.RESOURCE_ENERGY] = 0;
    target.hits = Math.min(target.hits + adjustedRepair, target.hitsMax);
    bulk.update(creep, { store: creep.store });
    bulk.update(target, { hits: target.hits });
    
    // Set actionLog on repairer (Screeps pattern)
    if (creep.actionLog) {
      creep.actionLog.repair = { x: target.x, y: target.y };
    }
    
    events.push({
      type: C.EVENT_REPAIR,
      objectId: creep._id,
      data: { targetId: target._id, amount: adjustedRepair }
    });
  } else {
    creep.store[C.RESOURCE_ENERGY] = energy - energyCost;
    target.hits = Math.min(target.hits + repairAmount, target.hitsMax);
    bulk.update(creep, { store: creep.store });
    bulk.update(target, { hits: target.hits });
    
    // Set actionLog on repairer (Screeps pattern)
    if (creep.actionLog) {
      creep.actionLog.repair = { x: target.x, y: target.y };
    }
    
    events.push({
      type: C.EVENT_REPAIR,
      objectId: creep._id,
      data: { targetId: target._id, amount: repairAmount }
    });
  }
}

