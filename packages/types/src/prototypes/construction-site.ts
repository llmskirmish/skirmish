import { GameObjectBase, type GameObject } from './game-object.js';
import type { Structure } from './structure.js';

/**
 * A site of a structure which is currently under construction
 */
export interface ConstructionSite extends GameObject {
  /** The current construction progress */
  readonly progress?: number;

  /** The total construction progress needed for the structure to be built */
  readonly progressTotal?: number;

  /** The structure that will be built (when the construction site is completed) */
  readonly structure?: Structure;

  /** Whether it is your construction site */
  readonly my?: boolean;

  /** Remove this construction site */
  remove(): void;
}

/**
 * ConstructionSite class for runtime use
 */
export class ConstructionSiteImpl extends GameObjectBase implements ConstructionSite {
  readonly progress?: number;
  readonly progressTotal?: number;
  readonly structure?: Structure;
  readonly my?: boolean;

  remove(): void {
    throw new Error('Not implemented - handled by processor');
  }
}

