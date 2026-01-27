import { GameObjectBase, type GameObject } from './game-object.js';
import type { Structure } from './structure.js';
import type { ConstructionSite } from './construction-site.js';
import type { Resource } from './resource.js';
import type { Source } from './source.js';
import type { Store } from './store.js';
import type { Position } from './position.js';
import type { FindPathOptions, Direction } from '../utils.js';
import type { 
  BodyPartType, 
  ResourceType,
  OK,
  ERR_NOT_OWNER,
  ERR_NOT_ENOUGH_RESOURCES,
  ERR_INVALID_TARGET,
  ERR_FULL,
  ERR_NOT_IN_RANGE,
  ERR_INVALID_ARGS,
  ERR_TIRED,
  ERR_NO_BODYPART
} from '../constants.js';

/** Body part definition */
export interface BodyPart {
  type: BodyPartType;
  hits: number;
}

/** Creep attack result type */
export type CreepAttackResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep build result type */
export type CreepBuildResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_NOT_ENOUGH_RESOURCES
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep drop result type */
export type CreepDropResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_INVALID_ARGS
  | typeof ERR_NOT_ENOUGH_RESOURCES;

/** Creep harvest result type */
export type CreepHarvestResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_ENOUGH_RESOURCES
  | typeof ERR_NOT_IN_RANGE;

/** Creep heal result type */
export type CreepHealResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep move result type */
export type CreepMoveResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_TIRED
  | typeof ERR_INVALID_ARGS;

/** Creep pickup result type */
export type CreepPickupResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_INVALID_TARGET
  | typeof ERR_FULL
  | typeof ERR_NOT_IN_RANGE;

/** Creep pull result type */
export type CreepPullResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_TIRED
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep ranged attack result type */
export type CreepRangedAttackResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep ranged heal result type */
export type CreepRangedHealResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE;

/** Creep ranged mass attack result type */
export type CreepRangedMassAttackResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_NO_BODYPART;

/** Creep transfer result type */
export type CreepTransferResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_INVALID_ARGS
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE
  | typeof ERR_FULL
  | typeof ERR_NOT_ENOUGH_RESOURCES;

/** Creep withdraw result type */
export type CreepWithdrawResult =
  | typeof OK
  | typeof ERR_NOT_OWNER
  | typeof ERR_INVALID_ARGS
  | typeof ERR_INVALID_TARGET
  | typeof ERR_NOT_IN_RANGE
  | typeof ERR_FULL
  | typeof ERR_NOT_ENOUGH_RESOURCES;

/**
 * Creeps are units that can move, harvest energy, construct structures, 
 * attack another creeps, and perform other actions.
 */
export interface Creep extends GameObject {
  /** An array describing the creep's body */
  body: BodyPart[];

  /** The movement fatigue indicator. If it is greater than zero, the creep cannot move */
  fatigue: number;

  /** The current amount of hit points of the creep */
  hits: number;

  /** The maximum amount of hit points of the creep */
  hitsMax: number;

  /** Whether it is your creep */
  my: boolean;

  /** A Store object that contains cargo of this creep */
  store: Store;

  /** Whether this creep is still being spawned */
  spawning: boolean;

  /** Attack another creep or structure in a short-ranged attack */
  attack(target: Creep | Structure): CreepAttackResult;

  /** Build a structure at the target construction site */
  build(target: ConstructionSite): CreepBuildResult;

  /** Drop a resource on the ground */
  drop(resource: ResourceType, amount?: number): CreepDropResult;

  /** Harvest energy from the source */
  harvest(target: Source): CreepHarvestResult;

  /** Heal self or another creep nearby */
  heal(target: Creep): CreepHealResult;

  /** Move the creep one square in the specified direction */
  move(direction: Direction): CreepMoveResult;

  /** Find the optimal path to the target and move to it */
  moveTo(target: Position, options?: FindPathOptions): CreepMoveResult;

  /** Pick up an item (a dropped piece of resource) */
  pickup(target: Resource): CreepPickupResult;

  /** Help another creep to follow this creep */
  pull(target: Creep): CreepPullResult;

  /** A ranged attack against another creep or structure */
  rangedAttack(target: Creep | Structure): CreepRangedAttackResult;

  /** Heal another creep at a distance */
  rangedHeal(target: Creep): CreepRangedHealResult;

  /** A ranged attack against all hostile creeps or structures within 3 squares range */
  rangedMassAttack(): CreepRangedMassAttackResult;

  /** Transfer resource from the creep to another object */
  transfer(target: Structure | Creep, resource: ResourceType, amount?: number): CreepTransferResult;

  /** Withdraw resources from a structure */
  withdraw(target: Structure, resource: ResourceType, amount?: number): CreepWithdrawResult;
}

/**
 * Creep class for runtime use
 */
export class CreepImpl extends GameObjectBase implements Creep {
  body: BodyPart[] = [];
  fatigue = 0;
  hits = 0;
  hitsMax = 0;
  my = false;
  store!: Store;
  spawning = false;

  attack(_target: Creep | Structure): CreepAttackResult {
    throw new Error('Not implemented - handled by processor');
  }

  build(_target: ConstructionSite): CreepBuildResult {
    throw new Error('Not implemented - handled by processor');
  }

  drop(_resource: ResourceType, _amount?: number): CreepDropResult {
    throw new Error('Not implemented - handled by processor');
  }

  harvest(_target: Source): CreepHarvestResult {
    throw new Error('Not implemented - handled by processor');
  }

  heal(_target: Creep): CreepHealResult {
    throw new Error('Not implemented - handled by processor');
  }

  move(_direction: Direction): CreepMoveResult {
    throw new Error('Not implemented - handled by processor');
  }

  moveTo(_target: Position, _options?: FindPathOptions): CreepMoveResult {
    throw new Error('Not implemented - handled by processor');
  }

  pickup(_target: Resource): CreepPickupResult {
    throw new Error('Not implemented - handled by processor');
  }

  pull(_target: Creep): CreepPullResult {
    throw new Error('Not implemented - handled by processor');
  }

  rangedAttack(_target: Creep | Structure): CreepRangedAttackResult {
    throw new Error('Not implemented - handled by processor');
  }

  rangedHeal(_target: Creep): CreepRangedHealResult {
    throw new Error('Not implemented - handled by processor');
  }

  rangedMassAttack(): CreepRangedMassAttackResult {
    throw new Error('Not implemented - handled by processor');
  }

  transfer(_target: Structure | Creep, _resource: ResourceType, _amount?: number): CreepTransferResult {
    throw new Error('Not implemented - handled by processor');
  }

  withdraw(_target: Structure, _resource: ResourceType, _amount?: number): CreepWithdrawResult {
    throw new Error('Not implemented - handled by processor');
  }
}

