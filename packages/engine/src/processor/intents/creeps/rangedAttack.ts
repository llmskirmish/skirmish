import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';
import { applyDamage, findRampartAt, EVENT_ATTACK_TYPE_RANGED } from '../damage.js';

export interface RangedAttackScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep ranged attack intent
 */
export function processRangedAttack(
  creep: RuntimeCreep,
  intent: ObjectIntents['rangedAttack'],
  scope: RangedAttackScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects } = scope;

  // Get target
  let target = roomObjects.get(intent.id);
  if (!target || target === creep) return;

  // Check range (max 3 tiles)
  if (dist(creep, target) > 3) return;

  // Check if target is spawning creep
  if (target.type === 'creep' && (target as RuntimeCreep).spawning) return;

  // Check if target has hits
  if (!('hits' in target) || !(target as { hits: number }).hits) return;

  // Check for rampart (attacks redirected to rampart)
  const rampart = findRampartAt(target.x, target.y, roomObjects);
  if (rampart) {
    target = rampart;
  }

  // Calculate attack power
  const attackPower = calcBodyEffectiveness(creep.body, C.RANGED_ATTACK, 'rangedAttack', C.RANGED_ATTACK_POWER);
  if (attackPower === 0) return;

  // Apply damage
  applyDamage(creep, target, attackPower, EVENT_ATTACK_TYPE_RANGED, scope);

  creep._rangedAttack = true;
}

