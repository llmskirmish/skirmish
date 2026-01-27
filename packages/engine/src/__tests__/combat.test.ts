/**
 * Combat tests
 * 
 * Tests creep combat mechanics including:
 * - Melee attack
 * - Ranged attack
 * - Ranged mass attack
 * - Healing
 * - Ranged healing
 * - Damage application and creep death
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import type { RuntimeCreep, RuntimeObject, TerrainData, GameEvent } from '../driver/types.js';
import { createCreep } from './helpers/creeps.js';
import { createEmptyTerrain } from './helpers/terrain.js';
import { createBulkMock } from './helpers/bulk.js';
import { resetIds } from './helpers/common.js';
import { processAttack } from '../processor/intents/creeps/attack.js';
import { processRangedAttack } from '../processor/intents/creeps/rangedAttack.js';
import { processRangedMassAttack } from '../processor/intents/creeps/rangedMassAttack.js';
import { processHeal } from '../processor/intents/creeps/heal.js';
import { processRangedHeal } from '../processor/intents/creeps/rangedHeal.js';
import { processCreepTick } from '../processor/intents/creeps/tick.js';

describe('Combat', () => {
  let roomObjects: Map<string, RuntimeObject>;
  let terrain: TerrainData;
  let events: GameEvent[];
  let gameTime: number;

  beforeEach(() => {
    resetIds();
    roomObjects = new Map();
    terrain = createEmptyTerrain();
    events = [];
    gameTime = 1;
  });

  /**
   * Process tick to apply damage/healing
   */
  function processTick(creep: RuntimeCreep): void {
    const bulk = createBulkMock(roomObjects);
    processCreepTick(creep, {
      roomObjects,
      bulk,
      events,
      gameTime,
      generateId: () => `generated_${Date.now()}`
    });
    bulk.execute();
  }

  describe('Melee Attack', () => {
    let attacker: RuntimeCreep;
    let target: RuntimeCreep;

    beforeEach(() => {
      attacker = createCreep('attacker', { x: 25, y: 25, user: 'player1' }, roomObjects);
      target = createCreep('scout', { x: 25, y: 26, user: 'player2' }, roomObjects);
    });

    it('deals damage to adjacent creep', () => {
      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      
      // Apply damage in tick
      processTick(target);

      // ATTACK_POWER is 30, target has 100 hits (1 MOVE part)
      expect(target.hits).toBe(100 - C.ATTACK_POWER);
      expect(events.some(e => e.type === C.EVENT_ATTACK)).toBe(true);
    });

    it('does not attack creep out of range', () => {
      target.x = 30; // Move far away
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not attack spawning creep', () => {
      target.spawning = true;
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not attack if attacker is spawning', () => {
      attacker.spawning = true;
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not attack self', () => {
      const initialHits = attacker.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: attacker._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(attacker);

      expect(attacker.hits).toBe(initialHits);
    });

    it('kills creep when damage exceeds hits', () => {
      // Create weak target
      const weakTarget = createCreep('scout', { x: 26, y: 25, user: 'player2' }, roomObjects);
      weakTarget.hits = 20; // Less than ATTACK_POWER (30)

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: weakTarget._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(weakTarget);

      // Creep should be removed
      expect(roomObjects.has(weakTarget._id)).toBe(false);
      expect(events.some(e => e.type === C.EVENT_OBJECT_DESTROYED)).toBe(true);
    });

    it('requires ATTACK body part', () => {
      // Use scout (no ATTACK part) as attacker
      const scout = createCreep('scout', { x: 24, y: 25, user: 'player1' }, roomObjects);
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(scout, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });
  });

  describe('Ranged Attack', () => {
    let attacker: RuntimeCreep;
    let target: RuntimeCreep;

    beforeEach(() => {
      attacker = createCreep('rangedAttacker', { x: 25, y: 25, user: 'player1' }, roomObjects);
      target = createCreep('scout', { x: 25, y: 28, user: 'player2' }, roomObjects); // 3 tiles away
    });

    it('deals damage at range 3', () => {
      const bulk = createBulkMock(roomObjects);
      processRangedAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      // RANGED_ATTACK_POWER is 10
      expect(target.hits).toBe(100 - C.RANGED_ATTACK_POWER);
    });

    it('does not attack beyond range 3', () => {
      target.y = 29; // 4 tiles away
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processRangedAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not attack spawning creep', () => {
      target.spawning = true;
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processRangedAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('requires RANGED_ATTACK body part', () => {
      const scout = createCreep('scout', { x: 24, y: 25, user: 'player1' }, roomObjects);
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processRangedAttack(scout, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });
  });

  describe('Ranged Mass Attack', () => {
    let attacker: RuntimeCreep;

    beforeEach(() => {
      attacker = createCreep('rangedAttacker', { x: 25, y: 25, user: 'player1' }, roomObjects);
    });

    it('damages all enemies in range', () => {
      const target1 = createCreep('scout', { x: 26, y: 25, user: 'player2' }, roomObjects); // range 1
      const target2 = createCreep('scout', { x: 27, y: 25, user: 'player2' }, roomObjects); // range 2
      const target3 = createCreep('scout', { x: 28, y: 25, user: 'player2' }, roomObjects); // range 3

      const bulk = createBulkMock(roomObjects);
      processRangedMassAttack(attacker, {}, { roomObjects, bulk, events });
      bulk.execute();
      
      processTick(target1);
      processTick(target2);
      processTick(target3);

      // Damage falloff: range 1 = 100%, range 2 = 40%, range 3 = 10%
      expect(target1.hits).toBe(100 - Math.floor(C.RANGED_ATTACK_POWER * 1));   // 100 - 10 = 90
      expect(target2.hits).toBe(100 - Math.floor(C.RANGED_ATTACK_POWER * 0.4)); // 100 - 4 = 96
      expect(target3.hits).toBe(100 - Math.floor(C.RANGED_ATTACK_POWER * 0.1)); // 100 - 1 = 99
    });

    it('does not damage friendly creeps', () => {
      const friendly = createCreep('scout', { x: 26, y: 25, user: 'player1' }, roomObjects);
      const initialHits = friendly.hits;

      const bulk = createBulkMock(roomObjects);
      processRangedMassAttack(attacker, {}, { roomObjects, bulk, events });
      bulk.execute();
      processTick(friendly);

      expect(friendly.hits).toBe(initialHits);
    });

    it('does not damage targets beyond range 3', () => {
      const farTarget = createCreep('scout', { x: 29, y: 25, user: 'player2' }, roomObjects); // range 4
      const initialHits = farTarget.hits;

      const bulk = createBulkMock(roomObjects);
      processRangedMassAttack(attacker, {}, { roomObjects, bulk, events });
      bulk.execute();
      processTick(farTarget);

      expect(farTarget.hits).toBe(initialHits);
    });
  });

  describe('Heal', () => {
    let healer: RuntimeCreep;
    let target: RuntimeCreep;

    beforeEach(() => {
      healer = createCreep('healer', { x: 25, y: 25, user: 'player1' }, roomObjects);
      target = createCreep('scout', { x: 25, y: 26, user: 'player1' }, roomObjects);
      target.hits = 50; // Damaged
    });

    it('heals adjacent creep', () => {
      processHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      // HEAL_POWER is 12
      expect(target.hits).toBe(50 + C.HEAL_POWER);
      expect(events.some(e => e.type === C.EVENT_HEAL)).toBe(true);
    });

    it('does not heal beyond range 1', () => {
      target.y = 28; // 3 tiles away
      const initialHits = target.hits;

      processHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not heal spawning creep', () => {
      target.spawning = true;
      const initialHits = target.hits;

      processHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('does not overheal beyond hitsMax', () => {
      target.hits = 95; // Only 5 below max

      processHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      expect(target.hits).toBe(target.hitsMax);
    });

    it('can heal self', () => {
      healer.hits = 100; // Damaged (2 parts = 200 hitsMax)

      processHeal(healer, { id: healer._id }, { roomObjects, events });
      processTick(healer);

      expect(healer.hits).toBe(100 + C.HEAL_POWER);
    });

    it('requires HEAL body part', () => {
      const scout = createCreep('scout', { x: 24, y: 25, user: 'player1' }, roomObjects);
      const initialHits = target.hits;

      processHeal(scout, { id: target._id }, { roomObjects, events });
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });
  });

  describe('Ranged Heal', () => {
    let healer: RuntimeCreep;
    let target: RuntimeCreep;

    beforeEach(() => {
      healer = createCreep('healer', { x: 25, y: 25, user: 'player1' }, roomObjects);
      target = createCreep('scout', { x: 25, y: 28, user: 'player1' }, roomObjects); // 3 tiles away
      target.hits = 50;
    });

    it('heals at range 3', () => {
      processRangedHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      // RANGED_HEAL_POWER is 4
      expect(target.hits).toBe(50 + C.RANGED_HEAL_POWER);
    });

    it('does not heal beyond range 3', () => {
      target.y = 29; // 4 tiles away
      const initialHits = target.hits;

      processRangedHeal(healer, { id: target._id }, { roomObjects, events });
      processTick(target);

      expect(target.hits).toBe(initialHits);
    });

    it('is weaker than melee heal', () => {
      expect(C.RANGED_HEAL_POWER).toBeLessThan(C.HEAL_POWER);
    });
  });

  describe('Damage and Death', () => {
    it('creep dies when hits reach 0', () => {
      const target = createCreep('scout', { x: 25, y: 25, user: 'player2' }, roomObjects);
      target.hits = 1;
      target._damageToApply = 10;

      processTick(target);

      expect(roomObjects.has(target._id)).toBe(false);
    });

    it('multiple attackers can damage same target', () => {
      const target = createCreep('warrior', { x: 25, y: 25, user: 'player2' }, roomObjects);
      const attacker1 = createCreep('attacker', { x: 24, y: 25, user: 'player1' }, roomObjects);
      const attacker2 = createCreep('attacker', { x: 26, y: 25, user: 'player1' }, roomObjects);

      const initialHits = target.hits;
      const bulk = createBulkMock(roomObjects);
      
      processAttack(attacker1, { id: target._id }, { roomObjects, bulk, events });
      processAttack(attacker2, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      expect(target.hits).toBe(initialHits - (C.ATTACK_POWER * 2));
    });

    it('healing and damage can cancel out', () => {
      // Use warrior with more body parts so hitsMax is higher
      const target = createCreep('warrior', { x: 25, y: 25, user: 'player1' }, roomObjects);
      target.hits = 400; // Damaged (hitsMax is 500)
      
      const healer = createCreep('healer', { x: 24, y: 25, user: 'player1' }, roomObjects);
      const attacker = createCreep('rangedAttacker', { x: 28, y: 25, user: 'player2' }, roomObjects);

      const bulk = createBulkMock(roomObjects);

      processHeal(healer, { id: target._id }, { roomObjects, events });
      processRangedAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      // HEAL_POWER (12) - RANGED_ATTACK_POWER (10) = +2
      expect(target.hits).toBe(400 + C.HEAL_POWER - C.RANGED_ATTACK_POWER);
    });
  });

  describe('Body Part Damage', () => {
    it('damaged body parts reduce attack power', () => {
      const attacker = createCreep('attacker', { x: 25, y: 25, user: 'player1' }, roomObjects);
      const target = createCreep('warrior', { x: 25, y: 26, user: 'player2' }, roomObjects);
      
      // Damage the ATTACK part (first part in attacker body)
      attacker.body[0].hits = 0;
      attacker.hits = 100; // Only MOVE part has hits now

      const initialHits = target.hits;
      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      // No damage should be dealt since ATTACK part is dead
      expect(target.hits).toBe(initialHits);
    });

    it('partially damaged creep still attacks with remaining parts', () => {
      // Create creep with 2 ATTACK parts
      const attacker = createCreep('attacker', { x: 25, y: 25, user: 'player1' }, roomObjects);
      attacker.body = [
        { type: C.ATTACK, hits: 100 },
        { type: C.ATTACK, hits: 0 }, // Dead
        { type: C.MOVE, hits: 100 }
      ];
      attacker.hits = 200;
      attacker.hitsMax = 300;

      const target = createCreep('warrior', { x: 25, y: 26, user: 'player2' }, roomObjects);
      const initialHits = target.hits;

      const bulk = createBulkMock(roomObjects);
      processAttack(attacker, { id: target._id }, { roomObjects, bulk, events });
      bulk.execute();
      processTick(target);

      // Only 1 ATTACK part working = 30 damage
      expect(target.hits).toBe(initialHits - C.ATTACK_POWER);
    });
  });
});

