import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface PullScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep pull intent
 * 
 * Pull allows one creep to help another creep follow it.
 * When a creep pulls another, the pulled creep will move to the puller's position
 * when the puller moves away.
 */
export function processPull(
  creep: RuntimeCreep,
  intent: { id: string },
  scope: PullScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target creep
  const target = roomObjects.get(intent.id) as RuntimeCreep | undefined;
  if (!target || target.type !== 'creep') return;
  if (target.spawning) return;

  // Can't pull yourself
  if (target._id === creep._id) return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Check for MOVE body part
  const movePower = calcBodyEffectiveness(creep.body, C.MOVE, 'pull', 1);
  if (movePower === 0) return;

  // Mark the target as being pulled by this creep
  target._pulledBy = creep._id;
  bulk.update(target, { _pulledBy: creep._id });

  // Mark the creep as pulling
  creep._pulling = target._id;
  bulk.update(creep, { _pulling: target._id });

  events.push({
    type: C.EVENT_PULL,
    objectId: creep._id,
    data: { targetId: target._id }
  });
}

