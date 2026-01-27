import { OwnedStructureBase, type OwnedStructure } from './owned-structure.js';
import type { Creep } from './creep.js';
import type { Structure } from './structure.js';
import type { Store } from './store.js';
import type { 
  OK,
  ERR_NOT_OWNER,
  ERR_TIRED,
  ERR_INVALID_TARGET,
  ERR_NOT_ENOUGH_ENERGY
} from '../constants.js';

/** Tower attack result type */
export type TowerAttackResult = 
  | typeof OK 
  | typeof ERR_NOT_OWNER 
  | typeof ERR_TIRED 
  | typeof ERR_INVALID_TARGET 
  | typeof ERR_NOT_ENOUGH_ENERGY;

/** Tower heal result type */
export type TowerHealResult = 
  | typeof OK 
  | typeof ERR_NOT_OWNER 
  | typeof ERR_TIRED 
  | typeof ERR_INVALID_TARGET 
  | typeof ERR_NOT_ENOUGH_ENERGY;

/**
 * Remotely attacks game objects or heals creeps within its range
 */
export interface StructureTower extends OwnedStructure {
  /** A Store object that contains cargo of this structure */
  store: Store;

  /** The remaining amount of ticks while this tower cannot be used */
  cooldown: number;

  /** Remotely attack any creep or structure in range */
  attack(target: Creep | Structure): TowerAttackResult;

  /** Remotely heal any creep in range */
  heal(target: Creep): TowerHealResult;
}

/**
 * StructureTower class for runtime use
 */
export class StructureTowerImpl extends OwnedStructureBase implements StructureTower {
  store!: Store;
  cooldown = 0;

  attack(_target: Creep | Structure): TowerAttackResult {
    throw new Error('Not implemented - handled by processor');
  }

  heal(_target: Creep): TowerHealResult {
    throw new Error('Not implemented - handled by processor');
  }
}

