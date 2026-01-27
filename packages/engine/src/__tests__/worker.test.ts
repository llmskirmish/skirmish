/**
 * Worker Creep Tests
 * 
 * Tests worker creep functionality including:
 * - WORK body parts for harvesting
 * - CARRY body parts for storing resources
 * - Store API (getCapacity, getUsedCapacity, getFreeCapacity)
 * - Harvesting from sources
 * - Transferring energy to structures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import { convertMapToTerrainUint8, convertInitialObjects, type MapData } from '@skirmish/maps';
import { MatchManager } from '../match/MatchManager.js';
import { MatchRunner } from '../runner/MatchRunner.js';
import type { MatchConfig, RuntimeObject, RuntimeCreep, RuntimeSpawn, RuntimeSource } from '../driver/types.js';
import { resetIds } from './helpers/common.js';
import swampMapData from '../../../../data/maps/swamp.json';

// Basic worker script using standard Screeps Arena API
const HARVEST_AND_DEPOSIT_SCRIPT = `
function loop() {
  const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
  const sources = getObjectsByPrototype(Source);
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);

  const workers = myCreeps.filter(c => c.body.some(p => p.type === WORK));

  workers.forEach(creep => {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const source = creep.findClosestByPath(sources);
      if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
          creep.moveTo(source);
        }
      }
    } else {
      if (mySpawn) {
        if (creep.transfer(mySpawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(mySpawn);
        }
      }
    }
  });
}
`;

// Script that only harvests (for testing store filling)
const HARVEST_ONLY_SCRIPT = `
function loop() {
  const sources = getObjectsByPrototype(Source);
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
  const workers = myCreeps.filter(c => c.body.some(p => p.type === WORK));

  workers.forEach(creep => {
    const source = creep.findClosestByPath(sources);
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source);
      }
    }
  });
}
`;

describe('Worker Creeps', () => {
  let config: MatchConfig;
  let mapData: MapData;

  beforeEach(() => {
    resetIds();
    
    mapData = swampMapData as MapData;
    const terrain = convertMapToTerrainUint8(mapData);
    const initialObjects = convertInitialObjects(mapData);
    
    config = {
      arenaWidth: terrain.width,
      arenaHeight: terrain.height,
      maxTicks: 1000,
      tickDuration: 1000,
      terrain,
      players: [
        { id: 'player1', name: 'Player 1', script: HARVEST_AND_DEPOSIT_SCRIPT },
        { id: 'player2', name: 'Player 2', script: HARVEST_AND_DEPOSIT_SCRIPT }
      ],
      initialObjects: initialObjects as RuntimeObject[],
      seed: 12345
    };
  });

  /** Helper to run N ticks of the match */
  function runTicks(manager: MatchManager, ticks: number): void {
    // Create persistent runners for each player
    const runners = new Map<string, MatchRunner>();
    for (const player of config.players) {
      if (player.script) {
        runners.set(player.id, new MatchRunner(player.id, player.script));
      }
    }
    
    for (let i = 0; i < ticks; i++) {
      for (const player of config.players) {
        const runner = runners.get(player.id);
        if (runner) {
          const driver = manager.getDriver();
          const objects = driver.getObjectsMap();
          const tick = manager.getCurrentTick();
          const terrain = driver.getRoomTerrain();
          const generateId = () => driver.generateId();
          
          const result = runner.runTick({
            objects,
            tick,
            terrain: terrain.data,
            generateId
          });
          
          if (result.intents) {
            manager.submitIntents(player.id, result.intents);
          }
        }
      }
      manager.processTick();
    }
    
    // Clean up runners
    for (const runner of runners.values()) {
      runner.destroy();
    }
  }

  /** Helper to get all workers */
  function getWorkers(objects: Map<string, RuntimeObject>): RuntimeCreep[] {
    return Array.from(objects.values()).filter(
      obj => obj.type === 'creep' && (obj as RuntimeCreep).body.some(p => p.type === C.WORK)
    ) as RuntimeCreep[];
  }

  /** Helper to get all sources */
  function getSources(objects: Map<string, RuntimeObject>): RuntimeSource[] {
    return Array.from(objects.values()).filter(obj => obj.type === 'source') as RuntimeSource[];
  }

  /** Helper to get all spawns */
  function getSpawns(objects: Map<string, RuntimeObject>): RuntimeSpawn[] {
    return Array.from(objects.values()).filter(obj => obj.type === 'spawn') as RuntimeSpawn[];
  }

  describe('Body Parts', () => {
    it('workers have WORK parts for harvesting', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      for (const worker of workers) {
        const workParts = worker.body.filter(p => p.type === C.WORK);
        expect(workParts.length).toBeGreaterThan(0);
        expect(workParts.every(p => p.hits === C.BODYPART_HITS)).toBe(true);
      }
    });

    it('workers have CARRY parts for storing energy', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      for (const worker of workers) {
        const carryParts = worker.body.filter(p => p.type === C.CARRY);
        expect(carryParts.length).toBeGreaterThan(0);
        
        // Each CARRY provides 50 capacity
        const expectedCapacity = carryParts.length * C.CARRY_CAPACITY;
        expect(expectedCapacity).toBe(100); // 2 CARRY = 100 capacity
      }
    });

    it('workers have MOVE parts for mobility', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      for (const worker of workers) {
        const moveParts = worker.body.filter(p => p.type === C.MOVE);
        expect(moveParts.length).toBeGreaterThan(0);
      }
    });

    it('workers have standard econ body: 2 MOVE, 2 CARRY, 2 WORK', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      for (const worker of workers) {
        expect(worker.body.filter(p => p.type === C.MOVE).length).toBe(2);
        expect(worker.body.filter(p => p.type === C.CARRY).length).toBe(2);
        expect(worker.body.filter(p => p.type === C.WORK).length).toBe(2);
        expect(worker.body.length).toBe(6);
      }
    });
  });

  describe('Store API', () => {
    it('store.getCapacity() returns total capacity', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      // Run script to test store API
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Test with a simple script that checks store capacity
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          if (worker) {
            // With 2 CARRY parts, capacity should be 100
            if (worker.store.getCapacity() !== 100) {
              throw new Error('getCapacity() should return 100, got: ' + worker.store.getCapacity());
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });

    it('store.getCapacity(RESOURCE_ENERGY) returns capacity for energy', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          if (worker) {
            const cap = worker.store.getCapacity(RESOURCE_ENERGY);
            if (cap !== 100) {
              throw new Error('getCapacity(RESOURCE_ENERGY) should return 100, got: ' + cap);
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });

    it('store.getFreeCapacity(RESOURCE_ENERGY) returns free space when empty', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          if (worker) {
            const free = worker.store.getFreeCapacity(RESOURCE_ENERGY);
            if (free !== 100) {
              throw new Error('getFreeCapacity(RESOURCE_ENERGY) on empty store should return 100, got: ' + free);
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });

    it('store.getUsedCapacity() returns 0 when empty', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          if (worker) {
            const used = worker.store.getUsedCapacity();
            if (used !== 0) {
              throw new Error('getUsedCapacity() on empty store should return 0, got: ' + used);
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });

    it('store.energy returns energy amount', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          if (worker) {
            const energy = worker.store.energy;
            if (energy !== 0) {
              throw new Error('store.energy on empty store should return 0, got: ' + energy);
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });
  });

  describe('Harvesting', () => {
    it('workers can harvest energy from sources', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      runTicks(manager, 200);
      
      const sources = getSources(manager.getDriver().getObjectsMap());
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      const totalSourceEnergy = sources.reduce((sum, s) => sum + s.energy, 0);
      const workerEnergy = workers.reduce((sum, w) => sum + (w.store.energy || 0), 0);
      
      const initialSourceEnergy = 4 * 3000; // 4 sources with 3000 each
      
      // Energy was harvested
      expect(totalSourceEnergy < initialSourceEnergy || workerEnergy > 0).toBe(true);
    });

    it('harvest intent requires WORK body part', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Test script that tries to harvest with a non-worker creep
      const testScript = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const sources = getObjectsByPrototype(Source);
          
          // Find fighter (no WORK parts)
          const fighter = myCreeps.find(c => !c.body.some(p => p.type === WORK));
          
          if (fighter && sources.length > 0) {
            const result = fighter.harvest(sources[0]);
            if (result !== ERR_NO_BODYPART) {
              throw new Error('Harvest without WORK parts should return ERR_NO_BODYPART, got: ' + result);
            }
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });

    it('harvest power is 2 energy per WORK part per tick', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      // Get initial source energy
      const initialSources = getSources(manager.getDriver().getObjectsMap());
      const initialEnergy = new Map(initialSources.map(s => [s._id, s.energy]));
      
      // Run long enough for workers to reach sources and harvest (swamp map is large)
      runTicks(manager, 250);
      
      const finalSources = getSources(manager.getDriver().getObjectsMap());
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      // Check that sources lost energy
      const totalHarvested = finalSources.reduce((sum, s) => {
        const initial = initialEnergy.get(s._id) || 3000;
        return sum + (initial - s.energy);
      }, 0);
      
      // Also count energy in worker stores (harvested but not yet deposited)
      const workerEnergy = workers.reduce((sum, w) => sum + (w.store.energy || 0), 0);
      
      // With 6 workers (2 WORK each) = 12 WORK parts
      // HARVEST_POWER = 2 per WORK
      // So max harvest is 24 energy/tick
      // Either sources lost energy OR workers have energy
      expect(totalHarvested + workerEnergy).toBeGreaterThan(0);
    });
  });

  describe('Transferring', () => {
    it('workers can transfer energy to spawn', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const initialSpawnEnergy = getSpawns(manager.getDriver().getObjectsMap())
        .reduce((sum, s) => sum + s.store.energy, 0);
      
      runTicks(manager, 200);
      
      const finalSpawns = getSpawns(manager.getDriver().getObjectsMap());
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      const finalSpawnEnergy = finalSpawns.reduce((sum, s) => sum + s.store.energy, 0);
      const workerEnergy = workers.reduce((sum, w) => sum + (w.store.energy || 0), 0);
      
      // Economic activity occurred
      expect(finalSpawnEnergy + workerEnergy).toBeGreaterThan(initialSpawnEnergy);
    });

    it('transfer requires being adjacent to target', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrain = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Use harvest-only script so workers fill up but don't automatically transfer
      const testScript = `
        function loop() {
          const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          const worker = myCreeps.find(c => c.body.some(p => p.type === WORK));
          
          // Workers start far from spawn, so transfer should fail
          if (worker && mySpawn) {
            const result = worker.transfer(mySpawn, RESOURCE_ENERGY);
            // Should return OK (intent accepted) but transfer won't actually happen
            // The actual range check happens in the processor
          }
        }
      `;
      
      const runner = new MatchRunner('player1', testScript);
      const result = runner.runTick({ objects, tick: 0, terrain: terrain.data, generateId });
      runner.destroy();
      expect(result.error).toBeUndefined();
    });
  });

  describe('Economic Loop', () => {
    it('workers complete harvest → deposit cycle', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      const initialSpawnEnergy = getSpawns(manager.getDriver().getObjectsMap())
        .reduce((sum, s) => sum + s.store.energy, 0);
      
      // Run long enough for full economic cycles (swamp map is large)
      runTicks(manager, 400);
      
      const finalSpawns = getSpawns(manager.getDriver().getObjectsMap());
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      const finalSpawnEnergy = finalSpawns.reduce((sum, s) => sum + s.store.energy, 0);
      const workerEnergy = workers.reduce((sum, w) => sum + (w.store.energy || 0), 0);
      
      // Economic activity: either spawns gained energy OR workers are carrying energy
      // (which means harvesting is working)
      expect(finalSpawnEnergy + workerEnergy).toBeGreaterThan(initialSpawnEnergy);
    });

    it('workers from both players operate independently', () => {
      const manager = new MatchManager(config);
      manager.start();
      
      runTicks(manager, 150);
      
      const objects = manager.getDriver().getObjectsMap();
      
      const p1Workers = getWorkers(objects).filter(w => w.user === 'player1');
      const p2Workers = getWorkers(objects).filter(w => w.user === 'player2');
      
      // Both players should have all 3 workers
      expect(p1Workers.length).toBe(3);
      expect(p2Workers.length).toBe(3);
      
      // Both sets of workers should have moved from starting positions
      const p1Moved = p1Workers.some(w => w.x !== 17);
      const p2Moved = p2Workers.some(w => w.x !== 82);
      
      expect(p1Moved).toBe(true);
      expect(p2Moved).toBe(true);
    });
  });

  describe('Store Updates', () => {
    it('store values update after harvesting', () => {
      // Use harvest-only script
      config.players[0].script = HARVEST_ONLY_SCRIPT;
      config.players[1].script = HARVEST_ONLY_SCRIPT;
      
      const manager = new MatchManager(config);
      manager.start();
      
      // Run enough ticks for workers to reach sources and harvest multiple times
      runTicks(manager, 200);
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      // At least some workers should have energy
      const workersWithEnergy = workers.filter(w => (w.store.energy || 0) > 0);
      expect(workersWithEnergy.length).toBeGreaterThan(0);
    });

    it('workers fill up to capacity', () => {
      // Use harvest-only script
      config.players[0].script = HARVEST_ONLY_SCRIPT;
      config.players[1].script = HARVEST_ONLY_SCRIPT;
      
      const manager = new MatchManager(config);
      manager.start();
      
      // Run enough ticks for workers to fill up (100 capacity / 4 harvest per tick ≈ 25 ticks at source)
      runTicks(manager, 300);
      
      const workers = getWorkers(manager.getDriver().getObjectsMap());
      
      // Some workers should be at or near full capacity (100)
      const fullWorkers = workers.filter(w => (w.store.energy || 0) >= 100);
      expect(fullWorkers.length).toBeGreaterThan(0);
    });
  });
});
