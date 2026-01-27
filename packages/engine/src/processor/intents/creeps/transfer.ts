import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent } from '../../../driver/types.js';
import { dist } from '../../utils.js';

export interface TransferScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

interface RuntimeWithStore {
  _id: string;
  type: string;
  x: number;
  y: number;
  store: Record<string, number>;
  storeCapacity?: number;
}

/**
 * Process creep transfer intent
 */
export function processTransfer(
  creep: RuntimeCreep,
  intent: { id: string; resourceType: string; amount?: number },
  scope: TransferScope
): void {
  if (!intent?.id || !intent.resourceType) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target
  const target = roomObjects.get(intent.id) as RuntimeWithStore | undefined;
  if (!target) return;

  // Check if target can store resources
  if (!target.store) return;

  // Can't transfer to a spawning creep (matches Screeps behavior)
  if (target.type === 'creep' && (target as unknown as RuntimeCreep).spawning) return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Get amount to transfer
  const resourceType = intent.resourceType;
  const creepAmount = creep.store?.[resourceType] || 0;
  if (creepAmount === 0) return;

  // Calculate target's free capacity
  const targetUsed = Object.values(target.store).reduce((sum, val) => sum + val, 0);
  const targetCapacity = target.storeCapacity || 0;
  const targetFree = Math.max(0, targetCapacity - targetUsed);

  if (targetFree === 0) return;

  // Calculate actual transfer amount
  let transferAmount = intent.amount ?? creepAmount;
  transferAmount = Math.min(transferAmount, creepAmount, targetFree);

  if (transferAmount <= 0) return;

  // Update creep's store
  creep.store[resourceType] = creepAmount - transferAmount;
  bulk.update(creep, { store: creep.store });

  // Update target's store
  target.store[resourceType] = (target.store[resourceType] || 0) + transferAmount;
  bulk.update(target as unknown as RuntimeObject, { store: target.store });

  events.push({
    type: C.EVENT_TRANSFER,
    objectId: creep._id,
    data: { targetId: target._id, resourceType, amount: transferAmount }
  });
}

