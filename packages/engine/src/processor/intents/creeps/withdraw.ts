import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent } from '../../../driver/types.js';
import { dist } from '../../utils.js';

export interface WithdrawScope {
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
}

/**
 * Process creep withdraw intent
 */
export function processWithdraw(
  creep: RuntimeCreep,
  intent: { id: string; resourceType: string; amount?: number },
  scope: WithdrawScope
): void {
  if (!intent?.id || !intent.resourceType) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target
  const target = roomObjects.get(intent.id) as RuntimeWithStore | undefined;
  if (!target) return;

  // Check if target has store
  if (!target.store) return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Get amount to withdraw
  const resourceType = intent.resourceType;
  const targetAmount = target.store?.[resourceType] || 0;
  if (targetAmount === 0) return;

  // Calculate creep's free capacity
  const creepUsed = Object.values(creep.store || {}).reduce((sum, val) => sum + val, 0);
  const creepCapacity = creep.storeCapacity || 0;
  const creepFree = Math.max(0, creepCapacity - creepUsed);

  if (creepFree === 0) return;

  // Calculate actual withdraw amount
  let withdrawAmount = intent.amount ?? targetAmount;
  withdrawAmount = Math.min(withdrawAmount, targetAmount, creepFree);

  if (withdrawAmount <= 0) return;

  // Update target's store
  target.store[resourceType] = targetAmount - withdrawAmount;
  bulk.update(target as unknown as RuntimeObject, { store: target.store });

  // Update creep's store
  if (!creep.store) creep.store = {};
  creep.store[resourceType] = (creep.store[resourceType] || 0) + withdrawAmount;
  bulk.update(creep, { store: creep.store });

  events.push({
    type: C.EVENT_WITHDRAW,
    objectId: creep._id,
    data: { targetId: target._id, resourceType, amount: withdrawAmount }
  });
}

