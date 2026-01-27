import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, RuntimeResource, BulkOperation, GameEvent } from '../../../driver/types.js';

export interface DropScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
  generateId: () => string;
}

/**
 * Process creep drop intent
 */
export function processDrop(
  creep: RuntimeCreep,
  intent: { resourceType: string; amount?: number },
  scope: DropScope
): void {
  if (!intent?.resourceType) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events, generateId } = scope;

  const resourceType = intent.resourceType;
  const creepAmount = creep.store?.[resourceType] || 0;
  if (creepAmount === 0) return;

  // Calculate drop amount
  let dropAmount = intent.amount ?? creepAmount;
  dropAmount = Math.min(dropAmount, creepAmount);

  if (dropAmount <= 0) return;

  // Update creep's store
  creep.store[resourceType] = creepAmount - dropAmount;
  bulk.update(creep, { store: creep.store });

  // Check if there's already a resource pile at this location
  let existingResource: RuntimeResource | undefined;
  for (const obj of roomObjects.values()) {
    if (obj.type === 'energy' && obj.x === creep.x && obj.y === creep.y) {
      const res = obj as RuntimeResource;
      if (res.resourceType === resourceType) {
        existingResource = res;
        break;
      }
    }
  }

  if (existingResource) {
    // Add to existing pile
    existingResource.amount = (existingResource.amount || 0) + dropAmount;
    bulk.update(existingResource, { amount: existingResource.amount });
  } else {
    // Create new resource pile
    const resourceId = generateId();
    const resource = {
      _id: resourceId,
      type: 'energy',
      x: creep.x,
      y: creep.y,
      resourceType,
      amount: dropAmount,
      ticksToDecay: C.RESOURCE_DECAY,
    } as RuntimeResource;
    bulk.insert(resource);
    roomObjects.set(resourceId, resource);
  }

  events.push({
    type: C.EVENT_DROP,
    objectId: creep._id,
    data: { resourceType, amount: dropAmount }
  });
}

