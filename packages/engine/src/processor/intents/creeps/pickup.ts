import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, RuntimeResource, BulkOperation, GameEvent } from '../../../driver/types.js';
import { dist } from '../../utils.js';

export interface PickupScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep pickup intent
 */
export function processPickup(
  creep: RuntimeCreep,
  intent: { id: string },
  scope: PickupScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target resource
  const target = roomObjects.get(intent.id) as RuntimeResource | undefined;
  if (!target || target.type !== 'energy') return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Check if creep has space
  const creepUsed = Object.values(creep.store || {}).reduce((sum, val) => sum + val, 0);
  const creepCapacity = creep.storeCapacity || 0;
  const creepFree = Math.max(0, creepCapacity - creepUsed);

  if (creepFree === 0) return;

  // Calculate pickup amount
  const resourceType = target.resourceType || C.RESOURCE_ENERGY;
  const pickupAmount = Math.min(target.amount || 0, creepFree);

  if (pickupAmount <= 0) return;

  // Update creep's store
  if (!creep.store) creep.store = {};
  creep.store[resourceType] = (creep.store[resourceType] || 0) + pickupAmount;
  bulk.update(creep, { store: creep.store });

  // Update or remove resource
  const remaining = (target.amount || 0) - pickupAmount;
  if (remaining <= 0) {
    bulk.remove(target._id);
  } else {
    target.amount = remaining;
    bulk.update(target, { amount: remaining });
  }

  events.push({
    type: C.EVENT_PICKUP,
    objectId: creep._id,
    data: { targetId: target._id, resourceType, amount: pickupAmount }
  });
}

