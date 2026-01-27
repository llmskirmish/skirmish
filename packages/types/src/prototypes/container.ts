import { OwnedStructureBase, type OwnedStructure } from './owned-structure.js';
import type { Store } from './store.js';

/**
 * A small container that can be used to store resources.
 * This is a walkable structure.
 * All dropped resources automatically go to the container at the same tile.
 */
export interface StructureContainer extends OwnedStructure {
  /** A Store object that contains cargo of this structure */
  store: Store;
}

/**
 * StructureContainer class for runtime use
 */
export class StructureContainerImpl extends OwnedStructureBase implements StructureContainer {
  store!: Store;
}

