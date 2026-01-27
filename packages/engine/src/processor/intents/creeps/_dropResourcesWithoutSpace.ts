import { C } from '@skirmish/types';
import type { RuntimeCreep, RuntimeObject, RuntimeResource, BulkOperation, GameEvent } from '../../../driver/types.js';
import { calcResources } from '../../utils.js';

export interface DropScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
  generateId: () => string;
}

/**
 * Drop resources that exceed the creep's current store capacity
 * Called when a creep takes damage and loses CARRY parts
 * 
 * Following Screeps pattern: iterate through resources and drop excess
 */
export function dropResourcesWithoutSpace(
  creep: RuntimeCreep,
  scope: DropScope
): void {
  const { roomObjects, bulk, events, generateId } = scope;
  
  // Get all resource types the creep has
  const resourceTypes = Object.keys(creep.store).filter(
    key => creep.store[key] > 0
  );
  
  for (const resourceType of resourceTypes) {
    const totalAmount = calcResources(creep);
    const capacity = creep.storeCapacity ?? 0;
    
    if (totalAmount <= capacity) {
      // No excess resources
      break;
    }
    
    const amount = creep.store[resourceType];
    if (amount > 0) {
      const dropAmount = Math.min(amount, totalAmount - capacity);
      if (dropAmount > 0) {
        // Reduce creep's store
        creep.store[resourceType] -= dropAmount;
        bulk.update(creep, { store: creep.store });
        
        // Create or update dropped resource at creep's position
        createDroppedResource(creep.x, creep.y, dropAmount, resourceType, scope);
        
        events.push({
          type: C.EVENT_DROP,
          objectId: creep._id,
          data: { resourceType, amount: dropAmount }
        });
      }
    }
  }
}

/**
 * Create a dropped resource or add to existing one at position
 */
function createDroppedResource(
  x: number,
  y: number,
  amount: number,
  resourceType: string,
  scope: DropScope
): void {
  const { roomObjects, bulk, generateId } = scope;
  
  amount = Math.round(amount);
  if (amount <= 0) return;
  
  // Check for existing dropped resource at this position
  let existingDrop: RuntimeResource | undefined;
  for (const obj of roomObjects.values()) {
    if (obj.type === 'energy' && obj.x === x && obj.y === y && 
        (obj as RuntimeResource).resourceType === resourceType) {
      existingDrop = obj as RuntimeResource;
      break;
    }
  }
  
  if (existingDrop) {
    // Add to existing dropped resource
    existingDrop.amount += amount;
    bulk.update(existingDrop, { amount: existingDrop.amount });
  } else {
    // Create new dropped resource
    const dropId = generateId();
    const droppedResource = {
      _id: dropId,
      type: 'energy',
      x,
      y,
      amount,
      resourceType,
    } as RuntimeResource;
    bulk.insert(droppedResource);
    roomObjects.set(dropId, droppedResource);
  }
}

