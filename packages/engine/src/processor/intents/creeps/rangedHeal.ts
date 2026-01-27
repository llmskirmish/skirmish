import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface RangedHealScope {
  roomObjects: Map<string, RuntimeObject>;
  events: GameEvent[];
}

/**
 * Process creep ranged heal intent
 */
export function processRangedHeal(
  creep: RuntimeCreep,
  intent: ObjectIntents['rangedHeal'],
  scope: RangedHealScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, events } = scope;

  // Get target
  const target = roomObjects.get(intent.id);
  if (!target || target.type !== 'creep') return;

  const targetCreep = target as RuntimeCreep;
  if (targetCreep.spawning) return;

  // Check range (max 3 tiles for ranged heal)
  if (dist(creep, target) > 3) return;

  // Calculate heal power (ranged heal is weaker)
  const healPower = calcBodyEffectiveness(creep.body, C.HEAL, 'heal', C.RANGED_HEAL_POWER);
  if (healPower === 0) return;

  // Apply healing (accumulated for tick processing)
  targetCreep._healToApply = (targetCreep._healToApply || 0) + healPower;

  // Set actionLog on healer and target (Screeps pattern)
  if (creep.actionLog) {
    creep.actionLog.rangedHeal = { x: target.x, y: target.y };
  }
  if (targetCreep.actionLog) {
    targetCreep.actionLog.healed = { x: creep.x, y: creep.y };
  }

  creep._rangedHeal = true;

  events.push({
    type: C.EVENT_HEAL,
    objectId: creep._id,
    data: { targetId: target._id, amount: healPower }
  });
}

