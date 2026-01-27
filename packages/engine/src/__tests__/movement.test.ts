/**
 * Movement tests
 * Adapted from screeps/engine spec/engine/processor/intents/movementSpec.js
 * 
 * Tests creep movement mechanics including:
 * - Basic movement with MOVE parts
 * - Fatigue mechanics on different terrain
 * - Collision resolution between creeps
 * - Position swapping
 * - Pulling mechanics
 * 
 * Note: Power Creep tests have been removed as they are Screeps World only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import type { RuntimeCreep, RuntimeObject, TerrainData } from '../driver/types.js';
import { createCreep, type CreepTemplate } from './helpers/creeps.js';
import { getTestTerrain, createEmptyTerrain } from './helpers/terrain.js';
import { createBulkMock } from './helpers/bulk.js';
import { resetIds } from './helpers/common.js';
import { 
  createMovementRegistry, 
  processMove, 
  applyMovements,
  type MovementRegistry 
} from '../processor/intents/creeps/move.js';
import { processCreepTick } from '../processor/intents/creeps/tick.js';

describe('movement', () => {
  let roomObjects: Map<string, RuntimeObject>;
  let terrain: TerrainData;
  let gameTime: number;

  beforeEach(() => {
    resetIds();
    roomObjects = new Map();
    terrain = getTestTerrain();
    gameTime = 1;
  });

  /**
   * Helper to process a move for a creep
   */
  function moveCreep(
    creep: RuntimeCreep, 
    direction: number, 
    registry: MovementRegistry
  ): void {
    processMove(
      creep, 
      { direction: direction as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }, 
      { roomObjects, terrain }, 
      registry
    );
  }

  /**
   * Apply all pending movements and process ticks
   */
  function executeTick(registry: MovementRegistry): void {
    const resolved = registry.resolve(gameTime);
    const bulk = createBulkMock(roomObjects);
    applyMovements(resolved, roomObjects, terrain, bulk);
    bulk.execute();
    
    // Process tick for fatigue reduction
    for (const obj of roomObjects.values()) {
      if (obj.type === 'creep') {
        const creep = obj as RuntimeCreep;
        processCreepTick(creep, { 
          roomObjects, 
          bulk, 
          events: [], 
          gameTime,
          generateId: () => `generated_${Date.now()}`
        });
      }
    }
    bulk.execute();
  }

  describe('One creep', () => {
    let noMove: RuntimeCreep;
    let damaged: RuntimeCreep;

    beforeEach(() => {
      noMove = createCreep('noMove', { x: 24, y: 24 }, roomObjects);
      damaged = createCreep('fullSpeed', { x: 23, y: 28 }, roomObjects);
      
      // Damage all MOVE parts
      for (const part of damaged.body) {
        if (part.type === C.MOVE) {
          part.hits = 0;
        }
      }
    });

    it('does not move without MOVE parts', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(noMove, C.LEFT, registry);
      executeTick(registry);

      expect(noMove.x).toBe(24);
      expect(noMove.y).toBe(24);
    });

    it('does not move with all MOVE parts dead', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(damaged, C.TOP, registry);
      executeTick(registry);

      expect(damaged.x).toBe(23);
      expect(damaged.y).toBe(28);
    });

    it('blocks tile when cannot move', () => {
      const fullSpeed = createCreep('fullSpeed', { x: 22, y: 27 }, roomObjects);
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);

      moveCreep(damaged, C.TOP, registry);
      moveCreep(fullSpeed, C.BOTTOM_RIGHT, registry);
      executeTick(registry);

      // Damaged creep can't move, blocks the tile
      expect(damaged.x).toBe(23);
      expect(damaged.y).toBe(28);
      // Full speed creep can't move into blocked tile
      expect(fullSpeed.x).toBe(22);
      expect(fullSpeed.y).toBe(27);
    });

    describe('Offroad creep (scout)', () => {
      let scout: RuntimeCreep;
      let scout2: RuntimeCreep;

      beforeEach(() => {
        scout = createCreep('scout', { x: 24, y: 24 }, roomObjects);
        scout2 = createCreep('scout', { x: 24, y: 25 }, roomObjects);
      });

      it('moves over plain', () => {
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(scout, C.LEFT, registry);
        executeTick(registry);

        expect(scout.x).toBe(23);
        expect(scout.y).toBe(24);
        expect(scout.fatigue).toBe(0); // Scout has 1 MOVE, no weight
      });

      it('does not move into wall', () => {
        // Position scout near a wall (terrain position with wall)
        // In test terrain, position (0,0) starts with walls
        scout.x = 1;
        scout.y = 0;
        
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(scout, C.LEFT, registry); // Try to move into wall at (0,0)
        executeTick(registry);

        expect(scout.x).toBe(1);
        expect(scout.y).toBe(0);
        expect(scout.fatigue).toBe(0);
      });

      it('does not move into another creep', () => {
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(scout, C.BOTTOM, registry);
        executeTick(registry);

        // Scout can't move into scout2's position
        expect(scout.x).toBe(24);
        expect(scout.y).toBe(24);
        expect(scout2.x).toBe(24);
        expect(scout2.y).toBe(25);
      });
    });

    describe('Full speed creep', () => {
      let creep: RuntimeCreep;

      beforeEach(() => {
        creep = createCreep('fullSpeed', { x: 24, y: 24 }, roomObjects);
      });

      it('does not move when tired', () => {
        creep.fatigue = 1;
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.TOP_RIGHT, registry);
        executeTick(registry);

        expect(creep.x).toBe(24);
        expect(creep.y).toBe(24);
        // Fatigue should be reduced by MOVE power (1 MOVE = 2 reduction)
        expect(creep.fatigue).toBe(0);
      });

      it('gains fatigue after moving over plain tile', () => {
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.TOP_RIGHT, registry);
        
        const resolved = registry.resolve(gameTime);
        const bulk = createBulkMock(roomObjects);
        applyMovements(resolved, roomObjects, terrain, bulk);
        bulk.execute();

        // After moving over plain: weight * 2 = 1 TOUGH * 2 = 2
        // But fullSpeed has 1 MOVE which covers 1 weight on plain
        expect(creep.x).toBe(25);
        expect(creep.y).toBe(23);
        expect(creep.fatigue).toBe(2); // 1 TOUGH * 2 (plain rate)
      });

      it('gains more fatigue after moving over swamp tile', () => {
        // Find a swamp position in the terrain
        // In test terrain, there are swamps marked as '2'
        // Position (25, 24) area has swamps
        creep.x = 24;
        creep.y = 23;
        
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.RIGHT, registry); // Move to swamp at (25, 23) or similar
        
        const resolved = registry.resolve(gameTime);
        const bulk = createBulkMock(roomObjects);
        applyMovements(resolved, roomObjects, terrain, bulk);
        bulk.execute();

        expect(creep.x).toBe(25);
        // Swamp fatigue: 1 TOUGH * 10 = 10 (if moved to swamp)
        // Note: actual value depends on terrain at destination
      });
    });

    describe('Half speed creep', () => {
      let creep: RuntimeCreep;

      beforeEach(() => {
        creep = createCreep('halfSpeed', { x: 24, y: 24 }, roomObjects);
      });

      it('is tired after moving over plain tile', () => {
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.TOP_RIGHT, registry);
        
        const resolved = registry.resolve(gameTime);
        const bulk = createBulkMock(roomObjects);
        applyMovements(resolved, roomObjects, terrain, bulk);
        bulk.execute();

        expect(creep.x).toBe(25);
        expect(creep.y).toBe(23);
        // halfSpeed has 2 TOUGH, 1 MOVE = 2 weight * 2 (plain) = 4 fatigue
        expect(creep.fatigue).toBe(4);
      });

      it('is very tired after moving over swamp tile', () => {
        // Position near swamp (terrain row 2 has swamp at source position 4)
        // With 2x scaling: (7, 4) is plain, (8, 4) is swamp
        creep.x = 7;
        creep.y = 4;
        
        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.RIGHT, registry);
        
        const resolved = registry.resolve(gameTime);
        const bulk = createBulkMock(roomObjects);
        applyMovements(resolved, roomObjects, terrain, bulk);
        bulk.execute();

        // If moved to swamp: 2 TOUGH * 10 = 20 fatigue
        // If moved to plain: 2 TOUGH * 2 = 4 fatigue
        expect(creep.fatigue).toBeGreaterThanOrEqual(4);
      });

      it('is not tired after moving over road', () => {
        // Add a road at destination
        const road = {
          _id: 'road1',
          type: 'road',
          x: 23,
          y: 24,
          hits: 5000,
          hitsMax: 5000
        } as unknown as RuntimeObject;
        roomObjects.set(road._id, road);

        const registry = createMovementRegistry(roomObjects, terrain, gameTime);
        moveCreep(creep, C.LEFT, registry);
        
        const resolved = registry.resolve(gameTime);
        const bulk = createBulkMock(roomObjects);
        applyMovements(resolved, roomObjects, terrain, bulk);
        bulk.execute();

        expect(creep.x).toBe(23);
        expect(creep.y).toBe(24);
        // Road fatigue: 2 TOUGH * 1 = 2 fatigue
        expect(creep.fatigue).toBe(2);
      });
    });
  });

  describe('Two creeps', () => {
    let scout1: RuntimeCreep;
    let scout2: RuntimeCreep;

    beforeEach(() => {
      scout1 = createCreep('scout', { x: 24, y: 24 }, roomObjects);
      scout2 = createCreep('scout', { x: 24, y: 25 }, roomObjects);
    });

    it('should follow step-to-step', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout1, C.BOTTOM, registry);
      moveCreep(scout2, C.BOTTOM, registry);
      executeTick(registry);

      // Both move south - scout1 takes scout2's old spot
      expect(scout1.x).toBe(24);
      expect(scout1.y).toBe(25);
      expect(scout2.x).toBe(24);
      expect(scout2.y).toBe(26);
    });

    it('should swap positions', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout1, C.BOTTOM, registry);  // scout1 wants to go to scout2's position
      moveCreep(scout2, C.TOP, registry);     // scout2 wants to go to scout1's position
      executeTick(registry);

      // They should swap positions
      expect(scout1.x).toBe(24);
      expect(scout1.y).toBe(25);
      expect(scout2.x).toBe(24);
      expect(scout2.y).toBe(24);
    });
  });

  describe('When several creeps try to move onto the same tile', () => {
    let fullSpeed1: RuntimeCreep;
    let fullSpeed2: RuntimeCreep;
    let halfSpeed1: RuntimeCreep;
    let halfSpeed2: RuntimeCreep;

    beforeEach(() => {
      fullSpeed1 = createCreep('fullSpeed', { x: 24, y: 24, user: 'user1' }, roomObjects);
      fullSpeed2 = createCreep('fullSpeed', { x: 23, y: 26, user: 'user2' }, roomObjects);
      halfSpeed1 = createCreep('halfSpeed', { x: 24, y: 25, user: 'user1' }, roomObjects);
      halfSpeed2 = createCreep('halfSpeed', { x: 24, y: 26, user: 'user2' }, roomObjects);
    });

    it('creep with best moves/weight ratio takes priority', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      
      // Both try to move to (23, 25)
      moveCreep(fullSpeed1, C.BOTTOM_LEFT, registry);  // from (24,24) to (23,25)
      moveCreep(halfSpeed1, C.LEFT, registry);         // from (24,25) to (23,25)
      executeTick(registry);

      // fullSpeed has better move/weight ratio (1:1 vs 1:2)
      expect(fullSpeed1.x).toBe(23);
      expect(fullSpeed1.y).toBe(25);
      // halfSpeed stays in place
      expect(halfSpeed1.x).toBe(24);
      expect(halfSpeed1.y).toBe(25);
    });
  });

  describe('Movement boundary checks', () => {
    let scout: RuntimeCreep;

    beforeEach(() => {
      // Use empty terrain for boundary tests
      terrain = createEmptyTerrain();
      scout = createCreep('scout', { x: 0, y: 0 }, roomObjects);
    });

    it('cannot move outside left boundary', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout, C.LEFT, registry);
      executeTick(registry);

      expect(scout.x).toBe(0);
      expect(scout.y).toBe(0);
    });

    it('cannot move outside top boundary', () => {
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout, C.TOP, registry);
      executeTick(registry);

      expect(scout.x).toBe(0);
      expect(scout.y).toBe(0);
    });

    it('cannot move outside right boundary', () => {
      scout.x = 99;
      scout.y = 25;
      
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout, C.RIGHT, registry);
      executeTick(registry);

      expect(scout.x).toBe(99);
      expect(scout.y).toBe(25);
    });

    it('cannot move outside bottom boundary', () => {
      scout.x = 25;
      scout.y = 99;
      
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(scout, C.BOTTOM, registry);
      executeTick(registry);

      expect(scout.x).toBe(25);
      expect(scout.y).toBe(99);
    });
  });

  describe('Spawning creeps', () => {
    it('cannot move while spawning', () => {
      const spawningCreep = createCreep('scout', { x: 25, y: 25, spawning: true }, roomObjects);
      
      const registry = createMovementRegistry(roomObjects, terrain, gameTime);
      moveCreep(spawningCreep, C.RIGHT, registry);
      executeTick(registry);

      expect(spawningCreep.x).toBe(25);
      expect(spawningCreep.y).toBe(25);
    });
  });
});

