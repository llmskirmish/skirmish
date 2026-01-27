import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';
import { applyDamage, EVENT_ATTACK_TYPE_RANGED_MASS } from '../damage.js';

export interface RangedMassAttackScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep ranged mass attack intent
 */
export function processRangedMassAttack(
  creep: RuntimeCreep,
  _intent: ObjectIntents['rangedMassAttack'],
  scope: RangedMassAttackScope
): void {
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects } = scope;

  // Calculate base attack power
  const basePower = calcBodyEffectiveness(creep.body, C.RANGED_ATTACK, 'rangedAttack', C.RANGED_ATTACK_POWER);
  if (basePower === 0) return;

  // Find all hostile targets in range 3
  for (const target of roomObjects.values()) {
    if (target === creep) continue;
    
    // Only attack objects with hits that belong to other users
    if (!('hits' in target) || !(target as { hits: number }).hits) continue;
    if ('user' in target && target.user === creep.user) continue;
    
    const range = dist(creep, target);
    if (range > 3) continue;

    // Damage based on distance: 10 at range 1, 4 at range 2, 1 at range 3
    let damageMultiplier = 1;
    if (range === 1) damageMultiplier = 1;
    else if (range === 2) damageMultiplier = 0.4;
    else if (range === 3) damageMultiplier = 0.1;

    const damage = Math.floor(basePower * damageMultiplier);
    if (damage > 0) {
      applyDamage(creep, target, damage, EVENT_ATTACK_TYPE_RANGED_MASS, scope);
    }
  }

  // Set actionLog on attacker (Screeps pattern)
  if (creep.actionLog) {
    creep.actionLog.rangedMassAttack = {};
  }

  creep._rangedMassAttack = true;
}

