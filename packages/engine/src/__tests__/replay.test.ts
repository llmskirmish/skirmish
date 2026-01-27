/**
 * Replay tests
 * 
 * Tests match replay functionality including:
 * - Initial state is correctly captured at tick 0
 * - Tick snapshots are independent (deep cloned)
 * - Replay data structure is correct
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';
import { MatchManager } from '../match/MatchManager.js';
import type { MatchConfig, RuntimeObject } from '../driver/types.js';
import { resetIds } from './helpers/common.js';
import { createEmptyTerrain } from './helpers/terrain.js';

describe('Replay', () => {
  let config: MatchConfig;

  beforeEach(() => {
    resetIds();
    
    // Create a minimal match config with known initial state
    config = {
      arenaWidth: DEFAULT_MAP_SIZE,
      arenaHeight: DEFAULT_MAP_SIZE,
      maxTicks: 100,
      tickDuration: 1000,
      terrain: createEmptyTerrain(),
      players: [
        { id: 'player1', name: 'Test Player 1', script: '' },
        { id: 'player2', name: 'Test Player 2', script: '' }
      ],
      initialObjects: [
        // Player 1 spawn with 300 energy
        {
          _id: '00',
          type: 'spawn',
          x: 10,
          y: 25,
          user: 'player1',
          hits: 5000,
          hitsMax: 5000,
          store: { energy: 300 },
          storeCapacity: 300,
          spawning: null,
          directions: [1, 2, 3, 4, 5, 6, 7, 8],
          exists: true
        },
        // Player 1 creep with full health
        {
          _id: '01',
          type: 'creep',
          x: 14,
          y: 25,
          user: 'player1',
          hits: 300,
          hitsMax: 300,
          fatigue: 0,
          my: true,
          spawning: false,
          store: {},
          body: [
            { type: C.ATTACK, hits: 100 },
            { type: C.MOVE, hits: 100 },
            { type: C.TOUGH, hits: 100 }
          ],
          exists: true
        },
        // Player 2 spawn with 300 energy
        {
          _id: '02',
          type: 'spawn',
          x: 40,
          y: 25,
          user: 'player2',
          hits: 5000,
          hitsMax: 5000,
          store: { energy: 300 },
          storeCapacity: 300,
          spawning: null,
          directions: [1, 2, 3, 4, 5, 6, 7, 8],
          exists: true
        },
        // Player 2 creep with full health
        {
          _id: '03',
          type: 'creep',
          x: 36,
          y: 25,
          user: 'player2',
          hits: 300,
          hitsMax: 300,
          fatigue: 0,
          my: true,
          spawning: false,
          store: {},
          body: [
            { type: C.ATTACK, hits: 100 },
            { type: C.MOVE, hits: 100 },
            { type: C.TOUGH, hits: 100 }
          ],
          exists: true
        }
      ] as RuntimeObject[]
    };
  });

  describe('Initial State Capture', () => {
    it('captures correct spawn energy at tick 0', () => {
      const manager = new MatchManager(config);
      manager.start();

      const replay = manager.getReplay();
      expect(replay.ticks.length).toBeGreaterThan(0);
      
      const tick0 = replay.ticks[0];
      expect(tick0.tick).toBe(0);

      // Find spawns in tick 0
      const spawns = tick0.objects.filter(obj => obj.type === 'spawn');
      expect(spawns.length).toBe(2);

      // Both spawns should have 300 energy
      for (const spawn of spawns) {
        expect((spawn as any).store.energy).toBe(300);
      }
    });

    it('captures correct creep body part hits at tick 0', () => {
      const manager = new MatchManager(config);
      manager.start();

      const replay = manager.getReplay();
      const tick0 = replay.ticks[0];

      // Find creeps in tick 0
      const creeps = tick0.objects.filter(obj => obj.type === 'creep');
      expect(creeps.length).toBe(2);

      // All creeps should have full health body parts
      for (const creep of creeps) {
        const body = (creep as any).body as Array<{ type: string; hits: number }>;
        for (const part of body) {
          expect(part.hits).toBe(100);
        }
      }
    });

    it('captures correct creep total hits at tick 0', () => {
      const manager = new MatchManager(config);
      manager.start();

      const replay = manager.getReplay();
      const tick0 = replay.ticks[0];

      const creeps = tick0.objects.filter(obj => obj.type === 'creep');
      for (const creep of creeps) {
        expect((creep as any).hits).toBe(300);
        expect((creep as any).hitsMax).toBe(300);
      }
    });
  });

  describe('Tick Independence', () => {
    it('tick 0 is not affected by subsequent tick processing', () => {
      const manager = new MatchManager(config);
      manager.start();

      // Get tick 0 state before processing
      const replayBefore = manager.getReplay();
      const tick0Before = replayBefore.ticks[0];
      const spawn0Before = tick0Before.objects.find(o => o._id === '00');
      const creep0Before = tick0Before.objects.find(o => o._id === '01');

      // Process several ticks
      for (let i = 0; i < 10; i++) {
        manager.processTick();
      }

      // Get tick 0 again after processing
      const replayAfter = manager.getReplay();
      const tick0After = replayAfter.ticks[0];
      const spawn0After = tick0After.objects.find(o => o._id === '00');
      const creep0After = tick0After.objects.find(o => o._id === '01');

      // Tick 0 values should be unchanged
      expect((spawn0After as any).store.energy).toBe((spawn0Before as any).store.energy);
      expect((creep0After as any).hits).toBe((creep0Before as any).hits);
      
      const bodyBefore = (creep0Before as any).body as Array<{ hits: number }>;
      const bodyAfter = (creep0After as any).body as Array<{ hits: number }>;
      for (let i = 0; i < bodyBefore.length; i++) {
        expect(bodyAfter[i].hits).toBe(bodyBefore[i].hits);
      }
    });

    it('each tick snapshot is independent', () => {
      const manager = new MatchManager(config);
      manager.start();

      // Process a few ticks
      for (let i = 0; i < 5; i++) {
        manager.processTick();
      }

      const replay = manager.getReplay();
      
      // Verify we have multiple ticks
      expect(replay.ticks.length).toBeGreaterThan(1);

      // Modify tick 0's data (this should not affect other ticks)
      const tick0Creep = replay.ticks[0].objects.find(o => o._id === '01');
      const tick1Creep = replay.ticks[1].objects.find(o => o._id === '01');

      if (tick0Creep && tick1Creep) {
        // These should be different object references
        expect(tick0Creep).not.toBe(tick1Creep);
        expect((tick0Creep as any).body).not.toBe((tick1Creep as any).body);
      }
    });
  });

  describe('Replay Structure', () => {
    it('has correct replay structure after start', () => {
      const manager = new MatchManager(config);
      manager.start();

      const replay = manager.getReplay();

      expect(replay.config).toBeDefined();
      expect(replay.ticks).toBeInstanceOf(Array);
      expect(replay.ticks.length).toBe(1); // Just tick 0
      expect(replay.victory).toBeUndefined(); // Match not finished
    });

    it('accumulates ticks during match', () => {
      const manager = new MatchManager(config);
      manager.start();

      const ticksToProcess = 5;
      for (let i = 0; i < ticksToProcess; i++) {
        manager.processTick();
      }

      const replay = manager.getReplay();
      // tick 0 + 5 processed ticks = 6 total
      expect(replay.ticks.length).toBe(ticksToProcess + 1);

      // Verify tick numbers are sequential
      for (let i = 0; i <= ticksToProcess; i++) {
        expect(replay.ticks[i].tick).toBe(i);
      }
    });

    it('each tick has objects and events arrays', () => {
      const manager = new MatchManager(config);
      manager.start();
      manager.processTick();

      const replay = manager.getReplay();

      for (const tick of replay.ticks) {
        expect(tick.objects).toBeInstanceOf(Array);
        expect(tick.events).toBeInstanceOf(Array);
        expect(tick.objects.length).toBeGreaterThan(0);
      }
    });
  });
});
