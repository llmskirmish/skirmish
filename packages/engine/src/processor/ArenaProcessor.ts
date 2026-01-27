import type { ArenaDriver } from '../driver/ArenaDriver.js';
import type { 
  RuntimeObject, 
  RuntimeCreep, 
  RuntimeSpawn, 
  RuntimeTower,
  RuntimeSource,
  RoomIntents,
  GameEvent,
  BulkOperation
} from '../driver/types.js';
import { C } from '@skirmish/types';

// Import intent handlers
import { processAttack } from './intents/creeps/attack.js';
import { processRangedAttack } from './intents/creeps/rangedAttack.js';
import { processRangedMassAttack } from './intents/creeps/rangedMassAttack.js';
import { processHeal } from './intents/creeps/heal.js';
import { processRangedHeal } from './intents/creeps/rangedHeal.js';
import { processHarvest } from './intents/creeps/harvest.js';
import { processMove, createMovementRegistry, applyMovements } from './intents/creeps/move.js';
import { processCreepTick } from './intents/creeps/tick.js';
import { processBuild } from './intents/creeps/build.js';
import { processRepair } from './intents/creeps/repair.js';
import { processDismantle } from './intents/creeps/dismantle.js';
import { processTransfer } from './intents/creeps/transfer.js';
import { processWithdraw } from './intents/creeps/withdraw.js';
import { processDrop } from './intents/creeps/drop.js';
import { processPickup } from './intents/creeps/pickup.js';
import { processTowerAttack } from './intents/towers/attack.js';
import { processTowerHeal } from './intents/towers/heal.js';
import { processTowerRepair } from './intents/towers/repair.js';
import { processTowerTick } from './intents/towers/tick.js';
import { processSpawnCreep } from './intents/spawns/spawnCreep.js';
import { processSetDirections } from './intents/spawns/setDirections.js';
import { processSpawnTick } from './intents/spawns/tick.js';

/**
 * Action log for visual effects
 */
export interface ActionLog {
  attack?: { x: number; y: number; id: string };
  rangedAttack?: { x: number; y: number; id: string };
  rangedMassAttack?: boolean;
  heal?: { x: number; y: number; id: string };
  rangedHeal?: { x: number; y: number; id: string };
  harvest?: { x: number; y: number; id: string };
  build?: { x: number; y: number; id: string };
  repair?: { x: number; y: number; id: string };
  transferEnergy?: { x: number; y: number; id: string };
  attacked?: boolean;
  healed?: boolean;
}

/**
 * Result object with action log for rendering
 * Index signature ensures compatibility with renderer's GameObjectState
 */
export interface ResultObject {
  _id: string;
  type: string;
  x: number;
  y: number;
  user?: string;
  actionLog?: ActionLog;
  [key: string]: unknown;
}

/**
 * Result of processing a tick
 */
export interface TickResult {
  tick: number;
  events: GameEvent[];
  objects: ResultObject[];
}

/**
 * Arena game processor
 * Processes player intents and updates game state
 */
export class ArenaProcessor {
  private driver: ArenaDriver;

  constructor(driver: ArenaDriver) {
    this.driver = driver;
  }

  /**
   * Process a single game tick
   */
  processTick(): TickResult {
    const { objects } = this.driver.getRoomObjects();
    const roomObjects = new Map(Object.entries(objects));
    const terrain = this.driver.getRoomTerrain();
    const intents = this.driver.getRoomIntents();
    const events: GameEvent[] = [];
    const bulk = this.driver.bulkObjectsWrite();
    const gameTime = this.driver.getGameTime();

    // Create scope for intent handlers
    const scope = {
      roomObjects,
      terrain,
      bulk,
      events,
      gameTime,
      generateId: () => this.driver.generateId()
    };

    // Initialize actionLog on all objects (Screeps pattern)
    // This resets actionLog each tick so intent handlers can set properties directly
    for (const obj of roomObjects.values()) {
      obj._actionLog = obj.actionLog; // Save previous tick's actionLog
      obj.actionLog = {
        attack: undefined,
        rangedAttack: undefined,
        rangedMassAttack: undefined,
        heal: undefined,
        rangedHeal: undefined,
        harvest: undefined,
        build: undefined,
        repair: undefined,
        transferEnergy: undefined,
        attacked: undefined,
        healed: undefined,
      };
    }

    // Phase 1: Process intents
    if (intents) {
      this.processIntents(intents, scope);
    }

    // Phase 2: Process movement (collision resolution)
    const movementRegistry = createMovementRegistry(roomObjects, terrain);
    
    // Re-process move intents with registry
    // Sort user IDs, alternating priority by tick for fairness
    if (intents) {
      let sortedUserIds = Object.keys(intents.users).sort();
      if (gameTime % 2 === 1) {
        sortedUserIds = sortedUserIds.reverse();
      }
      for (const userId of sortedUserIds) {
        const userIntents = intents.users[userId];
        const sortedObjectIds = Object.keys(userIntents.objects).sort();
        for (const objectId of sortedObjectIds) {
          const obj = roomObjects.get(objectId);
          if (obj?.type === 'creep') {
            const creep = obj as RuntimeCreep;
            const objIntents = userIntents.objects[objectId];
            if (objIntents.move) {
              processMove(creep, objIntents.move, { roomObjects, terrain }, movementRegistry);
            }
          }
        }
      }
    }

    // Resolve and apply movements
    const resolvedMovements = movementRegistry.resolve(gameTime);
    applyMovements(resolvedMovements, roomObjects, terrain, bulk);

    // Phase 3: Tick objects (apply damage/healing, cooldowns, spawning)
    // Sort by ID for deterministic processing order
    const sortedObjects = Array.from(roomObjects.values()).sort((a, b) => a._id.localeCompare(b._id));
    for (const obj of sortedObjects) {
      switch (obj.type) {
        case 'creep':
          processCreepTick(obj as RuntimeCreep, scope);
          break;
        case 'tower':
          processTowerTick(obj as RuntimeTower, { bulk });
          break;
        case 'spawn':
          processSpawnTick(obj as RuntimeSpawn, { roomObjects, bulk });
          break;
        case 'source':
          this.processSourceTick(obj as RuntimeSource, scope);
          break;
      }
    }

    // Execute bulk operations
    bulk.execute();

    // Clear intents for next tick
    this.driver.clearRoomIntents();

    // Increment game time
    this.driver.incrementGameTime();

    // Build result objects with action logs (actionLog is already set on objects by intent handlers)
    const resultObjects = this.buildResultObjects(roomObjects);
    
    // Return the NEW tick (after increment) so the UI shows the current tick
    return {
      tick: this.driver.getGameTime(),
      events,
      objects: resultObjects
    };
  }

  /**
   * Build result objects with action logs for rendering
   * Following Screeps pattern: actionLog is already set on objects by intent handlers
   */
  private buildResultObjects(
    _roomObjects: Map<string, RuntimeObject>
  ): ResultObject[] {
    const results: ResultObject[] = [];

    for (const obj of this.driver.getObjectsMap().values()) {
      const result = { ...obj } as ResultObject;
      
      // Copy actionLog from object (already populated by intent handlers)
      // Convert from internal format (with coordinates) to renderer format
      if (obj.actionLog) {
        const hasActions = Object.values(obj.actionLog).some(v => v !== undefined);
        if (hasActions) {
          const actionLog: ActionLog = {};
          
          if (obj.actionLog.attack) {
            actionLog.attack = { x: obj.actionLog.attack.x, y: obj.actionLog.attack.y, id: '' };
          }
          if (obj.actionLog.rangedAttack) {
            actionLog.rangedAttack = { x: obj.actionLog.rangedAttack.x, y: obj.actionLog.rangedAttack.y, id: '' };
          }
          if (obj.actionLog.rangedMassAttack) {
            actionLog.rangedMassAttack = true;
          }
          if (obj.actionLog.heal) {
            actionLog.heal = { x: obj.actionLog.heal.x, y: obj.actionLog.heal.y, id: '' };
          }
          if (obj.actionLog.rangedHeal) {
            actionLog.rangedHeal = { x: obj.actionLog.rangedHeal.x, y: obj.actionLog.rangedHeal.y, id: '' };
          }
          if (obj.actionLog.harvest) {
            actionLog.harvest = { x: obj.actionLog.harvest.x, y: obj.actionLog.harvest.y, id: '' };
          }
          if (obj.actionLog.build) {
            actionLog.build = { x: obj.actionLog.build.x, y: obj.actionLog.build.y, id: '' };
          }
          if (obj.actionLog.repair) {
            actionLog.repair = { x: obj.actionLog.repair.x, y: obj.actionLog.repair.y, id: '' };
          }
          if (obj.actionLog.transferEnergy) {
            actionLog.transferEnergy = { x: obj.actionLog.transferEnergy.x, y: obj.actionLog.transferEnergy.y, id: '' };
          }
          if (obj.actionLog.attacked) {
            actionLog.attacked = true;
          }
          if (obj.actionLog.healed) {
            actionLog.healed = true;
          }
          
          result.actionLog = actionLog;
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Process all user intents
   */
  private processIntents(
    intents: RoomIntents,
    scope: {
      roomObjects: Map<string, RuntimeObject>;
      bulk: BulkOperation;
      events: GameEvent[];
      generateId: (type?: string) => string;
      gameTime: number;
    }
  ): void {
    const { roomObjects, bulk, events, generateId, gameTime } = scope;

    // Sort user IDs, alternating priority by tick for fairness
    let sortedUserIds = Object.keys(intents.users).sort();
    if (gameTime % 2 === 1) {
      sortedUserIds = sortedUserIds.reverse(); // Alternate who goes first
    }
    for (const userId of sortedUserIds) {
      const userIntents = intents.users[userId];
      
      const sortedObjectIds = Object.keys(userIntents.objects).sort();
      for (const objectId of sortedObjectIds) {
        const obj = roomObjects.get(objectId);
        if (!obj) continue;

        // Verify object ownership
        if ('user' in obj && obj.user !== userId) continue;

        const objIntents = userIntents.objects[objectId];

        // Process creep intents
        if (obj.type === 'creep') {
          const creep = obj as RuntimeCreep;
          
          if (objIntents.attack) {
            processAttack(creep, objIntents.attack, { roomObjects, bulk, events });
          }
          if (objIntents.rangedAttack) {
            processRangedAttack(creep, objIntents.rangedAttack, { roomObjects, bulk, events });
          }
          if (objIntents.rangedMassAttack) {
            processRangedMassAttack(creep, objIntents.rangedMassAttack, { roomObjects, bulk, events });
          }
          if (objIntents.heal) {
            processHeal(creep, objIntents.heal, { roomObjects, events });
          }
          if (objIntents.rangedHeal) {
            processRangedHeal(creep, objIntents.rangedHeal, { roomObjects, events });
          }
          if (objIntents.harvest) {
            processHarvest(creep, objIntents.harvest, { roomObjects, bulk, events });
          }
          if (objIntents.build) {
            processBuild(creep, objIntents.build, { roomObjects, bulk, events, generateId });
          }
          if (objIntents.repair) {
            processRepair(creep, objIntents.repair, { roomObjects, bulk, events });
          }
          if (objIntents.dismantle) {
            processDismantle(creep, objIntents.dismantle, { roomObjects, bulk, events });
          }
          if (objIntents.transfer) {
            processTransfer(creep, objIntents.transfer, { roomObjects, bulk, events });
          }
          if (objIntents.withdraw) {
            processWithdraw(creep, objIntents.withdraw, { roomObjects, bulk, events });
          }
          if (objIntents.drop) {
            processDrop(creep, objIntents.drop, { roomObjects, bulk, events, generateId });
          }
          if (objIntents.pickup) {
            processPickup(creep, objIntents.pickup, { roomObjects, bulk, events });
          }
          // Move is handled separately for collision resolution
        }

        // Process tower intents
        if (obj.type === 'tower') {
          const tower = obj as RuntimeTower;
          
          if (objIntents.towerAttack) {
            processTowerAttack(tower, objIntents.towerAttack, { roomObjects, bulk, events });
          }
          if (objIntents.towerHeal) {
            processTowerHeal(tower, objIntents.towerHeal, { roomObjects, bulk, events });
          }
          if (objIntents.towerRepair) {
            processTowerRepair(tower, objIntents.towerRepair, { roomObjects, bulk, events });
          }
        }

        // Process spawn intents
        if (obj.type === 'spawn') {
          const spawn = obj as RuntimeSpawn;
          
          if (objIntents.spawnCreep) {
            processSpawnCreep(spawn, objIntents.spawnCreep, { roomObjects, bulk, events, generateId });
          }
          if (objIntents.setDirections) {
            processSetDirections(spawn, objIntents.setDirections, { bulk });
          }
        }
      }
    }
  }

  /**
   * Process source tick (energy regeneration)
   */
  private processSourceTick(
    source: RuntimeSource,
    scope: { bulk: BulkOperation; gameTime: number }
  ): void {
    const { bulk, gameTime } = scope;

    // Regenerate energy
    if (source.energy < source.energyCapacity) {
      if (!source.nextRegenTime || gameTime >= source.nextRegenTime) {
        source.energy = Math.min(
          source.energyCapacity,
          source.energy + C.SOURCE_ENERGY_REGEN
        );
        source.nextRegenTime = gameTime + 1;
        bulk.update(source, { 
          energy: source.energy,
          nextRegenTime: source.nextRegenTime
        } as Partial<RuntimeObject>);
      }
    }
  }
}

