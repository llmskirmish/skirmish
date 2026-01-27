/**
 * MatchRunner Tests
 *
 * Tests the MatchRunner class which executes player scripts with Arena API.
 * Key functionality tested:
 * - Global/module state persistence across ticks
 * - Stable object identity across ticks
 * - Player isolation (P1 cannot affect P2's objects/state)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { C } from '@skirmish/types';
import { convertMapToTerrainUint8, convertInitialObjects, type MapData } from '@skirmish/maps';
import { MatchRunner } from '../runner/MatchRunner.js';
import type { MatchConfig, RuntimeObject, RuntimeSpawn } from '../driver/types.js';
import { resetIds } from './helpers/common.js';
import swampMapData from '../../../../data/maps/swamp.json';
import { MatchManager } from '../match/MatchManager.js';

describe('MatchRunner', () => {
  let terrain: ReturnType<typeof convertMapToTerrainUint8>;
  let initialObjects: RuntimeObject[];
  let config: MatchConfig;
  
  beforeEach(() => {
    resetIds();
    
    const mapData = swampMapData as MapData;
    terrain = convertMapToTerrainUint8(mapData);
    initialObjects = convertInitialObjects(mapData) as RuntimeObject[];
    
    config = {
      arenaWidth: terrain.width,
      arenaHeight: terrain.height,
      maxTicks: 100,
      tickDuration: 1000,
      terrain,
      players: [
        { id: 'player1', name: 'Player 1', script: '' },
        { id: 'player2', name: 'Player 2', script: '' }
      ],
      initialObjects,
      seed: 12345
    };
  });
  
  describe('Global State Persistence', () => {
    it('should persist module-level variables across ticks', () => {
      const script = `
        // Module-level counter - should persist across ticks
        let counter = 0;
        
        function loop() {
          counter++;
          console.log('Counter: ' + counter);
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Run first tick
      const result1 = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result1.error).toBeUndefined();
      expect(result1.console).toContain('Counter: 1');
      
      // Run second tick - counter should now be 2
      const result2 = runner.runTick({
        objects,
        tick: 2,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result2.error).toBeUndefined();
      expect(result2.console).toContain('Counter: 2');
      
      // Run third tick - counter should be 3
      const result3 = runner.runTick({
        objects,
        tick: 3,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result3.error).toBeUndefined();
      expect(result3.console).toContain('Counter: 3');
      
      runner.destroy();
    });
    
    it('should persist complex state objects across ticks', () => {
      const script = `
        // Complex state object
        const state = {
          creepRoles: {},
          history: [],
          initialized: false
        };
        
        function loop() {
          if (!state.initialized) {
            state.initialized = true;
            state.history.push('init');
          } else {
            state.history.push('tick' + getTicks());
          }
          console.log('History length: ' + state.history.length);
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Run 5 ticks
      for (let tick = 1; tick <= 5; tick++) {
        const result = runner.runTick({
          objects,
          tick,
          terrain: terrainData.data,
          generateId
        });
        
        expect(result.error).toBeUndefined();
        expect(result.console).toContain(`History length: ${tick}`);
      }
      
      runner.destroy();
    });
    
    it('should allow storing references in closures', () => {
      const script = `
        // Store reference in closure
        let savedSpawn = null;
        
        function loop() {
          if (!savedSpawn) {
            const spawns = getObjectsByPrototype(StructureSpawn);
            savedSpawn = spawns.find(s => s.my);
            console.log('Saved spawn id: ' + savedSpawn.id);
          } else {
            console.log('Using saved spawn: ' + savedSpawn.id);
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // First tick - saves the spawn
      const result1 = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result1.error).toBeUndefined();
      expect(result1.console.some(l => l.startsWith('Saved spawn id:'))).toBe(true);
      
      // Second tick - uses saved spawn
      const result2 = runner.runTick({
        objects,
        tick: 2,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result2.error).toBeUndefined();
      expect(result2.console.some(l => l.startsWith('Using saved spawn:'))).toBe(true);
      
      runner.destroy();
    });
  });
  
  describe('Stable Object Identity', () => {
    it('should return same object instance for same game object across ticks', () => {
      const script = `
        let savedSpawnRef = null;
        
        function loop() {
          const spawns = getObjectsByPrototype(StructureSpawn);
          const mySpawn = spawns.find(s => s.my);
          
          if (!savedSpawnRef) {
            savedSpawnRef = mySpawn;
            console.log('First tick - saved reference');
          } else {
            // Check if it's the same object instance
            const isSame = savedSpawnRef === mySpawn;
            console.log('Same instance: ' + isSame);
            console.log('ID matches: ' + (savedSpawnRef.id === mySpawn.id));
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // First tick
      runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      // Second tick - check identity
      const result2 = runner.runTick({
        objects,
        tick: 2,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result2.error).toBeUndefined();
      expect(result2.console).toContain('Same instance: true');
      expect(result2.console).toContain('ID matches: true');
      
      runner.destroy();
    });
    
    it('should update object properties while maintaining identity', () => {
      const script = `
        let savedSpawn = null;
        let initialEnergy = null;
        
        function loop() {
          const spawns = getObjectsByPrototype(StructureSpawn);
          const mySpawn = spawns.find(s => s.my);
          
          if (!savedSpawn) {
            savedSpawn = mySpawn;
            initialEnergy = mySpawn.store.energy;
            console.log('Initial energy: ' + initialEnergy);
          } else {
            // Same reference but updated properties
            console.log('Same ref: ' + (savedSpawn === mySpawn));
            console.log('Current energy: ' + savedSpawn.store.energy);
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      
      // First tick
      let objects = driver.getObjectsMap();
      let terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result1 = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result1.error).toBeUndefined();
      
      // Process engine tick to potentially change state
      manager.processTick();
      
      // Second tick with updated game state
      objects = driver.getObjectsMap();
      const result2 = runner.runTick({
        objects,
        tick: 2,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result2.error).toBeUndefined();
      expect(result2.console).toContain('Same ref: true');
      
      runner.destroy();
    });
    
    it('should mark destroyed objects as exists=false', () => {
      // Create a simple test where we check exists property
      const script = `
        let savedCreeps = [];
        
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
          
          if (savedCreeps.length === 0) {
            savedCreeps = myCreeps;
            console.log('Saved ' + myCreeps.length + ' creeps');
          } else {
            const stillExist = savedCreeps.filter(c => c.exists).length;
            console.log('Still exist: ' + stillExist);
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      
      runner.destroy();
    });
  });
  
  describe('Player Isolation', () => {
    it('should have separate global state per player', () => {
      const script1 = `
        let myCounter = 0;
        function loop() {
          myCounter += 10;
          console.log('P1 counter: ' + myCounter);
        }
      `;
      
      const script2 = `
        let myCounter = 0;
        function loop() {
          myCounter += 1;
          console.log('P2 counter: ' + myCounter);
        }
      `;
      
      const runner1 = new MatchRunner('player1', script1);
      const runner2 = new MatchRunner('player2', script2);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Run 3 ticks for both players
      for (let tick = 1; tick <= 3; tick++) {
        const result1 = runner1.runTick({
          objects,
          tick,
          terrain: terrainData.data,
          generateId
        });
        
        const result2 = runner2.runTick({
          objects,
          tick,
          terrain: terrainData.data,
          generateId
        });
        
        expect(result1.error).toBeUndefined();
        expect(result2.error).toBeUndefined();
        
        // P1 increments by 10 each tick
        expect(result1.console).toContain(`P1 counter: ${tick * 10}`);
        // P2 increments by 1 each tick
        expect(result2.console).toContain(`P2 counter: ${tick}`);
      }
      
      runner1.destroy();
      runner2.destroy();
    });
    
    it('should not share object wrapper instances between players', () => {
      const script1 = `
        function loop() {
          const spawns = getObjectsByPrototype(StructureSpawn);
          const enemySpawn = spawns.find(s => !s.my);
          
          // Try to set custom property on enemy spawn
          if (enemySpawn) {
            enemySpawn.customProp = 'set by P1';
            console.log('P1 set customProp on enemy spawn');
          }
        }
      `;
      
      const script2 = `
        function loop() {
          const spawns = getObjectsByPrototype(StructureSpawn);
          const mySpawn = spawns.find(s => s.my);
          
          // Check if P1's modification is visible
          if (mySpawn) {
            const hasCustomProp = mySpawn.customProp !== undefined;
            console.log('P2 sees customProp: ' + hasCustomProp);
          }
        }
      `;
      
      const runner1 = new MatchRunner('player1', script1);
      const runner2 = new MatchRunner('player2', script2);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // P1 modifies enemy spawn
      const result1 = runner1.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result1.error).toBeUndefined();
      expect(result1.console).toContain('P1 set customProp on enemy spawn');
      
      // P2 checks its own spawn - should NOT see P1's modification
      const result2 = runner2.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result2.error).toBeUndefined();
      // P2 should NOT see the customProp that P1 set
      expect(result2.console).toContain('P2 sees customProp: false');
      
      runner1.destroy();
      runner2.destroy();
    });
    
    it('should prevent modifying enemy objects via intents', () => {
      const script = `
        function loop() {
          const enemyCreeps = getObjectsByPrototype(Creep).filter(c => !c.my);
          
          if (enemyCreeps.length > 0) {
            // Try to move an enemy creep - should fail with ERR_NOT_OWNER
            const result = enemyCreeps[0].move(TOP);
            console.log('Move result: ' + result);
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      // Should get ERR_NOT_OWNER (-1)
      expect(result.console.some(l => l.includes('-1'))).toBe(true);
      
      runner.destroy();
    });
  });
  
  describe('API Compatibility', () => {
    it('should provide all Arena API functions', () => {
      const script = `
        function loop() {
          // Test that all API functions exist
          const checks = [
            typeof getObjectsByPrototype === 'function',
            typeof getObjectById === 'function',
            typeof getObjects === 'function',
            typeof getTicks === 'function',
            typeof getTerrainAt === 'function',
            typeof getRange === 'function',
            typeof getDirection === 'function',
            typeof findClosestByRange === 'function',
            typeof findInRange === 'function',
            typeof findClosestByPath === 'function',
            typeof findPath === 'function',
            typeof searchPath === 'function',
            typeof createConstructionSite === 'function',
            typeof CostMatrix === 'function',
            typeof Visual === 'function'
          ];
          
          const allExist = checks.every(c => c);
          console.log('All API functions exist: ' + allExist);
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      expect(result.console).toContain('All API functions exist: true');
      
      runner.destroy();
    });
    
    it('should provide all constants', () => {
      const script = `
        function loop() {
          const checks = [
            typeof ATTACK === 'string',
            typeof MOVE === 'string',
            typeof WORK === 'string',
            typeof CARRY === 'string',
            typeof HEAL === 'string',
            typeof RANGED_ATTACK === 'string',
            typeof TOUGH === 'string',
            typeof TOP === 'number',
            typeof BOTTOM === 'number',
            typeof LEFT === 'number',
            typeof RIGHT === 'number',
            typeof TERRAIN_PLAIN === 'number',
            typeof TERRAIN_WALL === 'number',
            typeof TERRAIN_SWAMP === 'number',
            typeof RESOURCE_ENERGY === 'string',
            typeof OK === 'number',
            typeof ERR_NOT_OWNER === 'number',
            typeof ERR_NO_PATH === 'number'
          ];
          
          const allExist = checks.every(c => c);
          console.log('All constants exist: ' + allExist);
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      expect(result.console).toContain('All constants exist: true');
      
      runner.destroy();
    });
    
    it('should provide prototype classes for getObjectsByPrototype', () => {
      const script = `
        function loop() {
          const checks = [
            typeof Creep === 'function',
            typeof StructureSpawn === 'function',
            typeof StructureTower === 'function',
            typeof Source === 'function',
            typeof Resource === 'function',
            typeof ConstructionSite === 'function'
          ];
          
          const allExist = checks.every(c => c);
          console.log('All prototypes exist: ' + allExist);
          
          // Actually use them
          const creeps = getObjectsByPrototype(Creep);
          const spawns = getObjectsByPrototype(StructureSpawn);
          const sources = getObjectsByPrototype(Source);
          
          console.log('Found ' + creeps.length + ' creeps');
          console.log('Found ' + spawns.length + ' spawns');
          console.log('Found ' + sources.length + ' sources');
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      expect(result.console).toContain('All prototypes exist: true');
      expect(result.console.some(l => l.startsWith('Found') && l.includes('spawns'))).toBe(true);
      
      runner.destroy();
    });
  });
  
  describe('Intent Collection', () => {
    it('should collect intents from player actions', () => {
      const script = `
        function loop() {
          const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
          if (mySpawn && !mySpawn.spawning) {
            mySpawn.spawnCreep([MOVE, ATTACK]);
            console.log('Spawning creep');
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      expect(result.console).toContain('Spawning creep');
      
      // Check that intents were collected
      const intentIds = Object.keys(result.intents.objects);
      expect(intentIds.length).toBeGreaterThan(0);
      
      // Find the spawn intent
      const hasSpawnIntent = intentIds.some(id => {
        const intent = result.intents.objects[id];
        return intent.spawnCreep !== undefined;
      });
      expect(hasSpawnIntent).toBe(true);
      
      runner.destroy();
    });
    
    it('should collect movement intents', () => {
      const script = `
        function loop() {
          const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my && !c.spawning);
          if (myCreeps.length > 0) {
            myCreeps[0].move(TOP);
            console.log('Moving creep');
          }
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeUndefined();
      
      // Check for move intent if we have creeps
      const creeps = Array.from(objects.values()).filter(
        o => o.type === 'creep' && o.user === 'player1'
      );
      if (creeps.length > 0) {
        expect(result.console).toContain('Moving creep');
      }
      
      runner.destroy();
    });
  });
  
  describe('Error Handling', () => {
    it('should catch and report script errors', () => {
      const script = `
        function loop() {
          throw new Error('Test error from script');
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      const result = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Test error from script');
      
      runner.destroy();
    });
    
    it('should continue working after an error', () => {
      const script = `
        let tickCount = 0;
        
        function loop() {
          tickCount++;
          if (tickCount === 2) {
            throw new Error('Error on tick 2');
          }
          console.log('Tick ' + tickCount + ' OK');
        }
      `;
      
      const runner = new MatchRunner('player1', script);
      const manager = new MatchManager(config);
      manager.start();
      
      const driver = manager.getDriver();
      const objects = driver.getObjectsMap();
      const terrainData = driver.getRoomTerrain();
      const generateId = () => driver.generateId();
      
      // Tick 1 - should work
      const result1 = runner.runTick({
        objects,
        tick: 1,
        terrain: terrainData.data,
        generateId
      });
      expect(result1.error).toBeUndefined();
      expect(result1.console).toContain('Tick 1 OK');
      
      // Tick 2 - should error
      const result2 = runner.runTick({
        objects,
        tick: 2,
        terrain: terrainData.data,
        generateId
      });
      expect(result2.error).toBeDefined();
      
      // Tick 3 - should recover and work
      const result3 = runner.runTick({
        objects,
        tick: 3,
        terrain: terrainData.data,
        generateId
      });
      expect(result3.error).toBeUndefined();
      expect(result3.console).toContain('Tick 3 OK');
      
      runner.destroy();
    });
  });
});
