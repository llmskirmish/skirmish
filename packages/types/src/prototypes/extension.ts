import { OwnedStructureBase, type OwnedStructure } from './owned-structure.js';
import type { Store } from './store.js';

/**
 * Contains energy that can be spent on spawning bigger creeps
 */
export interface StructureExtension extends OwnedStructure {
  /** A Store object that contains cargo of this structure */
  store: Store;
}

/**
 * StructureExtension class for runtime use
 */
export class StructureExtensionImpl extends OwnedStructureBase implements StructureExtension {
  store!: Store;
}

