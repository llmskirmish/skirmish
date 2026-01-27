import { StructureBase, type Structure } from './structure.js';

/**
 * The base prototype for a structure that has an owner
 */
export interface OwnedStructure extends Structure {
  /** True for your structure, false for a hostile structure, undefined for a neutral structure */
  readonly my?: boolean;
}

/**
 * Base OwnedStructure class for runtime use
 */
export class OwnedStructureBase extends StructureBase implements OwnedStructure {
  readonly my?: boolean;
}

