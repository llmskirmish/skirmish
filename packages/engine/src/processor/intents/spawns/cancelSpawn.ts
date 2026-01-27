import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeSpawn, RuntimeCreep, BulkOperation, GameEvent } from '../../../driver/types.js';

export interface CancelSpawnScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process spawn cancel intent
 * 
 * Cancels the current spawning process and refunds a portion of the energy.
 */
export function processCancelSpawn(
  spawn: RuntimeSpawn,
  intent: Record<string, never>,
  scope: CancelSpawnScope
): void {
  if (spawn.type !== 'spawn') return;

  const { roomObjects, bulk, events } = scope;

  // Check if spawn is currently spawning
  if (!spawn.spawning) return;

  const spawning = spawn.spawning;
  const creepId = spawning.creep;

  // Find and remove the spawning creep
  const creep = roomObjects.get(creepId) as RuntimeCreep | undefined;
  if (creep) {
    bulk.remove(creepId);
    roomObjects.delete(creepId);
  }

  // Calculate refund (based on remaining time / total time)
  // Refund is proportional to how much spawning time is left
  const refundRatio = spawning.remainingTime / spawning.needTime;
  
  // Calculate original cost (would need to be stored, simplified here)
  // For now, assume 200 energy per body part (average)
  const estimatedCost = spawning.needTime / C.CREEP_SPAWN_TIME * 100;
  const refundAmount = Math.floor(estimatedCost * refundRatio * 0.5); // 50% refund

  // Add refund to spawn's store
  if (refundAmount > 0) {
    const currentEnergy = spawn.store?.[C.RESOURCE_ENERGY] || 0;
    const newEnergy = currentEnergy + refundAmount;
    
    if (!spawn.store) spawn.store = {};
    spawn.store[C.RESOURCE_ENERGY] = newEnergy;
  }

  // Clear spawning state
  spawn.spawning = null;
  bulk.update(spawn, { spawning: null, store: spawn.store });

  events.push({
    type: C.EVENT_OBJECT_DESTROYED,
    objectId: creepId,
    data: { reason: 'cancelled', refundAmount }
  });
}

