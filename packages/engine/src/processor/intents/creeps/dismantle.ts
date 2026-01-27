import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent, RuntimeStructure } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface DismantleScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep dismantle intent
 */
export function processDismantle(
  creep: RuntimeCreep,
  intent: { id: string },
  scope: DismantleScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target structure
  const target = roomObjects.get(intent.id) as RuntimeStructure | undefined;
  if (!target) return;

  // Check if target has hits
  if (!('hits' in target)) return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Check for WORK body parts
  const dismantlePower = calcBodyEffectiveness(creep.body, C.WORK, 'dismantle', C.DISMANTLE_POWER);
  if (dismantlePower === 0) return;

  // Apply damage to structure
  const actualDamage = Math.min(dismantlePower, target.hits);
  target.hits -= actualDamage;
  
  // Return energy to creep (50% of dismantle power)
  const energyGain = Math.floor(actualDamage * C.DISMANTLE_COST);
  const freeCapacity = (creep.body.filter(p => p.type === 'carry').length * C.CARRY_CAPACITY) - 
                       Object.values(creep.store || {}).reduce((a, b) => a + b, 0);
  const actualEnergy = Math.min(energyGain, freeCapacity);
  
  if (actualEnergy > 0) {
    creep.store = creep.store || {};
    creep.store[C.RESOURCE_ENERGY] = (creep.store[C.RESOURCE_ENERGY] || 0) + actualEnergy;
    bulk.update(creep, { store: creep.store });
  }

  // Check if structure is destroyed
  if (target.hits <= 0) {
    bulk.remove(target._id);
    roomObjects.delete(target._id);
    
    events.push({
      type: C.EVENT_DISMANTLE,
      objectId: creep._id,
      data: { targetId: target._id, destroyed: true }
    });
  } else {
    bulk.update(target, { hits: target.hits });
    
    events.push({
      type: C.EVENT_DISMANTLE,
      objectId: creep._id,
      data: { targetId: target._id, amount: actualDamage }
    });
  }
}

