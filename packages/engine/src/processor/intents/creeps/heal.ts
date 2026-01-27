import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface HealScope {
  roomObjects: Map<string, RuntimeObject>;
  events: GameEvent[];
}

/**
 * Process creep heal intent
 */
export function processHeal(
  creep: RuntimeCreep,
  intent: ObjectIntents['heal'],
  scope: HealScope
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

  // Check range (must be adjacent for full heal)
  if (dist(creep, target) > 1) return;

  // Calculate heal power
  const healPower = calcBodyEffectiveness(creep.body, C.HEAL, 'heal', C.HEAL_POWER);
  if (healPower === 0) return;

  // Apply healing (accumulated for tick processing)
  targetCreep._healToApply = (targetCreep._healToApply || 0) + healPower;

  // Set actionLog on healer and target (Screeps pattern)
  if (creep.actionLog) {
    creep.actionLog.heal = { x: target.x, y: target.y };
  }
  if (targetCreep.actionLog) {
    targetCreep.actionLog.healed = { x: creep.x, y: creep.y };
  }

  creep._heal = true;

  events.push({
    type: C.EVENT_HEAL,
    objectId: creep._id,
    data: { targetId: target._id, amount: healPower }
  });
}

/**
 * Extend RuntimeCreep type for heal tracking
 */
declare module '../../../driver/types.js' {
  interface RuntimeCreep {
    _healToApply?: number;
    _damageToApply?: number;
  }
}

