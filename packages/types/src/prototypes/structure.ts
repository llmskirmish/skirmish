import { GameObjectBase, type GameObject } from './game-object.js';

/**
 * The base prototype object of all structures
 */
export interface Structure extends GameObject {
  /** The current amount of hit points of the structure */
  readonly hits?: number;

  /** The maximum amount of hit points of the structure */
  readonly hitsMax?: number;
}

/**
 * Base Structure class for runtime use
 */
export class StructureBase extends GameObjectBase implements Structure {
  readonly hits?: number;
  readonly hitsMax?: number;
}

