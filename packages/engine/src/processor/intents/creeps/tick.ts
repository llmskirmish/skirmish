import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent } from '../../../driver/types.js';
import { calcMovePower, recalcBody, clearOldHits } from '../../utils.js';
import { dropResourcesWithoutSpace, type DropScope } from './_dropResourcesWithoutSpace.js';

export interface TickScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
  gameTime: number;
  generateId: (type?: string) => string;
}

/**
 * Process creep tick - apply accumulated damage/healing and fatigue reduction
 * Following Screeps pattern with _oldHits preservation and resource dropping
 */
export function processCreepTick(
  creep: RuntimeCreep,
  scope: TickScope
): void {
  const { roomObjects, bulk, events, generateId } = scope;

  // Store old hits to detect damage (Screeps pattern)
  const oldHits = creep.hits;

  // Apply accumulated damage
  if (creep._damageToApply && creep._damageToApply > 0) {
    creep.hits -= creep._damageToApply;
    delete creep._damageToApply;
  }

  // Apply accumulated healing
  if (creep._healToApply && creep._healToApply > 0) {
    creep.hits += creep._healToApply;
    delete creep._healToApply;
  }

  // Clamp hits to valid range
  if (creep.hits > creep.hitsMax) {
    creep.hits = creep.hitsMax;
  }

  // Check if creep died
  if (creep.hits <= 0) {
    bulk.remove(creep._id);
    events.push({
      type: C.EVENT_OBJECT_DESTROYED,
      objectId: creep._id,
      data: { objectType: 'creep' }
    });
    return;
  }

  // If hits changed, recalculate body (Screeps pattern)
  if (creep.hits !== oldHits) {
    // Recalculate body part hits and store capacity
    recalcBody(creep);

    // If creep took damage, drop resources that no longer fit
    if (creep.hits < oldHits) {
      const dropScope: DropScope = { roomObjects, bulk, events, generateId };
      dropResourcesWithoutSpace(creep, dropScope);
    }

    bulk.update(creep, {
      hits: creep.hits,
      body: creep.body,
      storeCapacity: creep.storeCapacity,
      store: creep.store,
    } as Partial<RuntimeObject>);
  }

  // Reduce fatigue (Screeps pattern: MOVE parts reduce fatigue)
  if (creep.fatigue > 0) {
    const movePower = calcMovePower(creep.body);
    creep.fatigue = Math.max(0, creep.fatigue - movePower);
    bulk.update(creep, { fatigue: creep.fatigue } as Partial<RuntimeObject>);
  }

  // Clear _oldHits at end of tick (Screeps pattern)
  clearOldHits(creep);

  // Clear action flags
  delete creep._attack;
  delete creep._heal;
  delete creep._rangedAttack;
  delete creep._rangedHeal;
  delete creep._rangedMassAttack;
  delete creep._harvest;
  delete creep._pull;
  delete creep._pulled;
  delete creep._move;
  delete creep._oldFatigue;
}

