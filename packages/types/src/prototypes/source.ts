import { GameObjectBase, type GameObject } from './game-object.js';

/**
 * An energy source object. Can be harvested by creeps with a WORK body part.
 */
export interface Source extends GameObject {
  /** Current amount of energy in the source */
  energy: number;

  /** The maximum amount of energy in the source */
  energyCapacity: number;
}

/**
 * Source class for runtime use
 */
export class SourceImpl extends GameObjectBase implements Source {
  energy = 0;
  energyCapacity = 0;
}

