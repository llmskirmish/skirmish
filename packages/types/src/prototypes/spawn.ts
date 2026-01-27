import { OwnedStructureBase, type OwnedStructure } from './owned-structure.js';
import type { Creep } from './creep.js';
import type { Store } from './store.js';
import type { 
  BodyPartType,
  DirectionConstant,
  OK,
  ERR_NOT_OWNER,
  ERR_INVALID_ARGS,
  ERR_NOT_ENOUGH_ENERGY,
  ERR_BUSY
} from '../constants.js';

/**
 * Spawn creep result
 */
export interface SpawnCreepResult {
  /** The instance of the Creep being spawned */
  object?: Creep;

  /** The error code */
  error?: typeof ERR_NOT_OWNER | typeof ERR_INVALID_ARGS | typeof ERR_NOT_ENOUGH_ENERGY | typeof ERR_BUSY;
}

/**
 * Set directions result type
 */
export type SetDirectionsResult = typeof OK | typeof ERR_NOT_OWNER | typeof ERR_INVALID_ARGS;

/**
 * Details of the creep being spawned currently
 */
export interface Spawning {
  /** Time needed in total to complete the spawning */
  needTime: number;

  /** Remaining time to go */
  remainingTime: number;

  /** The creep that being spawned */
  creep: Creep;

  /** Cancel spawning immediately */
  cancel(): typeof OK | typeof ERR_NOT_OWNER | undefined;
}

/**
 * This structure can create creeps. It also auto-regenerates a little amount of energy each tick.
 */
export interface StructureSpawn extends OwnedStructure {
  /** A Store object that contains cargo of this structure */
  store: Store;

  /** If the spawn is in process of spawning a new creep, this object will contain a Spawning object, or null otherwise */
  spawning: Spawning | null;

  /** The directions in which the spawn can create creeps */
  directions: DirectionConstant[];

  /** Set the directions in which the spawn can create creeps */
  setDirections(directions: DirectionConstant[]): SetDirectionsResult;

  /** Start the creep spawning process */
  spawnCreep(body: BodyPartType[]): SpawnCreepResult;
}

/**
 * StructureSpawn class for runtime use
 */
export class StructureSpawnImpl extends OwnedStructureBase implements StructureSpawn {
  store!: Store;
  spawning: Spawning | null = null;
  directions: DirectionConstant[] = [];

  setDirections(_directions: DirectionConstant[]): SetDirectionsResult {
    throw new Error('Not implemented - handled by processor');
  }

  spawnCreep(_body: BodyPartType[]): SpawnCreepResult {
    throw new Error('Not implemented - handled by processor');
  }
}

