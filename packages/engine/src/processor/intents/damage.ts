import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent } from '../../driver/types.js';
import { calcBodyEffectiveness } from '../utils.js';

/** Attack type constants for events */
export const EVENT_ATTACK_TYPE_MELEE = 1;
export const EVENT_ATTACK_TYPE_RANGED = 2;
export const EVENT_ATTACK_TYPE_RANGED_MASS = 3;
export const EVENT_ATTACK_TYPE_HIT_BACK = 4;

export interface DamageScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Apply damage to a target
 * Following Screeps pattern: sets actionLog directly on objects
 */
export function applyDamage(
  attacker: RuntimeObject,
  target: RuntimeObject,
  damage: number,
  attackType: number,
  scope: DamageScope
): void {
  const { roomObjects, bulk, events } = scope;

  if (!target._id || !('hits' in target) || !(target as { hits: number }).hits) {
    return;
  }

  const targetWithHits = target as { hits: number; hitsMax?: number; _damageToApply?: number };
  let attackBackPower = 0;

  if (target.type === 'creep') {
    const creepTarget = target as RuntimeCreep;
    
    // Melee attack back
    if (attackType === EVENT_ATTACK_TYPE_MELEE) {
      // Check if attacker is on a rampart
      const attackerOnRampart = Array.from(roomObjects.values()).some(
        obj => obj.type === 'rampart' && obj.x === attacker.x && obj.y === attacker.y
      );
      
      if (!attackerOnRampart) {
        attackBackPower = calcBodyEffectiveness(creepTarget.body, C.ATTACK, 'attack', C.ATTACK_POWER);
      }
    }
    
    creepTarget._damageToApply = (creepTarget._damageToApply || 0) + damage;
  } else {
    // Structure - apply damage directly
    targetWithHits.hits -= damage;

    if (targetWithHits.hits <= 0) {
      // Destroy structure
      bulk.remove(target._id);
      events.push({
        type: C.EVENT_OBJECT_DESTROYED,
        objectId: target._id,
        data: { objectType: target.type }
      });
    } else {
      bulk.update(target, { hits: targetWithHits.hits } as Partial<RuntimeObject>);
    }
  }

  // Set actionLog on attacker (Screeps pattern)
  if (attacker.actionLog) {
    if (attackType === EVENT_ATTACK_TYPE_MELEE) {
      attacker.actionLog.attack = { x: target.x, y: target.y };
    }
    if (attackType === EVENT_ATTACK_TYPE_RANGED) {
      attacker.actionLog.rangedAttack = { x: target.x, y: target.y };
    }
  }

  // Set actionLog.attacked on target (Screeps pattern)
  if (target.actionLog) {
    target.actionLog.attacked = { x: attacker.x, y: attacker.y };
  }

  // Attack back (for melee)
  if (attackBackPower > 0 && 'hits' in attacker) {
    const attackerCreep = attacker as RuntimeCreep;
    attackerCreep._damageToApply = (attackerCreep._damageToApply || 0) + attackBackPower;
    
    // Set attacked on the attacker too (they got hit back)
    if (attacker.actionLog) {
      attacker.actionLog.attacked = { x: target.x, y: target.y };
    }
    
    events.push({
      type: C.EVENT_ATTACK,
      objectId: target._id,
      data: { targetId: attacker._id, damage: attackBackPower }
    });
  }

  events.push({
    type: C.EVENT_ATTACK,
    objectId: attacker._id,
    data: { targetId: target._id, damage }
  });
}

/**
 * Find rampart at position (for damage redirection)
 */
export function findRampartAt(
  x: number, 
  y: number, 
  roomObjects: Map<string, RuntimeObject>
): RuntimeObject | null {
  for (const obj of roomObjects.values()) {
    if (obj.type === 'rampart' && obj.x === x && obj.y === y) {
      return obj;
    }
  }
  return null;
}

