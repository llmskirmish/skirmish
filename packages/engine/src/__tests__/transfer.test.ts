/**
 * Transfer tests
 * Adapted from screeps/engine spec/engine/processor/intents/creeps/transferSpec.js
 * 
 * Tests creep resource transfer mechanics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import type { RuntimeCreep, RuntimeSpawn, RuntimeObject, TerrainData, GameEvent } from '../driver/types.js';
import { createCreep } from './helpers/creeps.js';
import { createEmptyTerrain } from './helpers/terrain.js';
import { createBulkMock } from './helpers/bulk.js';
import { resetIds, generateId } from './helpers/common.js';
import { processTransfer } from '../processor/intents/creeps/transfer.js';

describe('Creep transferring resource', () => {
  let roomObjects: Map<string, RuntimeObject>;
  let terrain: TerrainData;
  let lorry1: RuntimeCreep;
  let lorry2: RuntimeCreep;
  let events: GameEvent[];

  beforeEach(() => {
    resetIds();
    roomObjects = new Map();
    terrain = createEmptyTerrain();
    events = [];

    lorry1 = createCreep('lorry', { x: 24, y: 24 }, roomObjects);
    lorry2 = createCreep('lorry', { x: 24, y: 25 }, roomObjects);
  });

  it('does not transfer to a creep being spawned', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 0 };
    lorry2.spawning = true;

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 100 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(100);
    expect(lorry2.store.energy).toBe(0);
  });

  it('transfers energy to adjacent creep', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 0 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 50 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(50);
    expect(lorry2.store.energy).toBe(50);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(C.EVENT_TRANSFER);
  });

  it('transfers all energy when amount not specified', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 0 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(0);
    expect(lorry2.store.energy).toBe(100);
  });

  it('does not transfer to out of range creep', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 0 };
    lorry2.x = 30; // Move far away

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 100 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(100);
    expect(lorry2.store.energy).toBe(0);
  });

  it('transfers only up to target capacity', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 80 };
    lorry2.storeCapacity = 100; // Can only hold 20 more

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 100 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(80);
    expect(lorry2.store.energy).toBe(100);
  });

  it('does not transfer if target is full', () => {
    lorry1.store = { energy: 100 };
    lorry2.store = { energy: 100 };
    lorry2.storeCapacity = 100;

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 50 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(100);
    expect(lorry2.store.energy).toBe(100);
    expect(events.length).toBe(0);
  });

  it('does not transfer more than creep has', () => {
    lorry1.store = { energy: 30 };
    lorry2.store = { energy: 0 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 100 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(0);
    expect(lorry2.store.energy).toBe(30);
  });

  it('does not transfer if source creep is spawning', () => {
    lorry1.store = { energy: 100 };
    lorry1.spawning = true;
    lorry2.store = { energy: 0 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 50 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(100);
    expect(lorry2.store.energy).toBe(0);
  });

  it('does not transfer if creep has none of resource', () => {
    lorry1.store = { energy: 0 };
    lorry2.store = { energy: 0 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: lorry2._id, 
      resourceType: C.RESOURCE_ENERGY, 
      amount: 50 
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(0);
    expect(lorry2.store.energy).toBe(0);
  });

  it('transfers energy to adjacent spawn', () => {
    const spawn = {
      _id: generateId(),
      type: 'spawn',
      x: 24,
      y: 25,
      user: 'user1',
      hits: 5000,
      hitsMax: 5000,
      store: { energy: 100 },
      storeCapacity: 300,
      spawning: null,
      directions: [1, 2, 3, 4, 5, 6, 7, 8]
    } as unknown as RuntimeSpawn;
    roomObjects.set(spawn._id, spawn);

    lorry1.store = { energy: 50 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: spawn._id, 
      resourceType: C.RESOURCE_ENERGY
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(lorry1.store.energy).toBe(0);
    expect(spawn.store.energy).toBe(150);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(C.EVENT_TRANSFER);
  });

  it('transfers only up to spawn capacity', () => {
    const spawn = {
      _id: generateId(),
      type: 'spawn',
      x: 24,
      y: 25,
      user: 'user1',
      hits: 5000,
      hitsMax: 5000,
      store: { energy: 280 },
      storeCapacity: 300,
      spawning: null,
      directions: [1, 2, 3, 4, 5, 6, 7, 8]
    } as unknown as RuntimeSpawn;
    roomObjects.set(spawn._id, spawn);

    lorry1.store = { energy: 50 };

    const bulk = createBulkMock(roomObjects);
    processTransfer(lorry1, { 
      id: spawn._id, 
      resourceType: C.RESOURCE_ENERGY
    }, { roomObjects, bulk, events });
    bulk.execute();

    // Only 20 energy should transfer (300 - 280 = 20 free)
    expect(lorry1.store.energy).toBe(30);
    expect(spawn.store.energy).toBe(300);
  });

  it('transfers energy from dynamically spawned creep (no storeCapacity) to spawn', () => {
    // Simulate a creep that was dynamically spawned - no storeCapacity set
    const worker = {
      _id: generateId(),
      type: 'creep',
      x: 24,
      y: 24,
      user: 'user1',
      body: [
        { type: C.WORK, hits: 100 },
        { type: C.CARRY, hits: 100 },
        { type: C.MOVE, hits: 100 },
        { type: C.MOVE, hits: 100 }
      ],
      hits: 400,
      hitsMax: 400,
      fatigue: 0,
      my: true,
      spawning: false,
      store: { energy: 40 },  // Harvested 40 energy
      // NOTE: storeCapacity is NOT set - this simulates a dynamically spawned creep
    } as unknown as RuntimeCreep;
    roomObjects.set(worker._id, worker);

    const spawn = {
      _id: generateId(),
      type: 'spawn',
      x: 24,
      y: 25,
      user: 'user1',
      hits: 5000,
      hitsMax: 5000,
      store: { energy: 100 },
      storeCapacity: 300,
      spawning: null,
      directions: [1, 2, 3, 4, 5, 6, 7, 8]
    } as unknown as RuntimeSpawn;
    roomObjects.set(spawn._id, spawn);

    const bulk = createBulkMock(roomObjects);
    processTransfer(worker, { 
      id: spawn._id, 
      resourceType: C.RESOURCE_ENERGY
      // amount is undefined - should transfer all
    }, { roomObjects, bulk, events });
    bulk.execute();

    expect(worker.store.energy).toBe(0);
    expect(spawn.store.energy).toBe(140);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(C.EVENT_TRANSFER);
  });
});

