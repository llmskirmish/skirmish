import { OwnedStructureBase, type OwnedStructure } from './owned-structure.js';

/**
 * Blocks movement of hostile creeps, and defends your creeps and structures on the same position.
 */
export interface StructureRampart extends OwnedStructure {}

/**
 * StructureRampart class for runtime use
 */
export class StructureRampartImpl extends OwnedStructureBase implements StructureRampart {}

