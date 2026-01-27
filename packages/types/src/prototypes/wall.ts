import { StructureBase, type Structure } from './structure.js';

/**
 * Blocks movement of all creeps
 */
export interface StructureWall extends Structure {}

/**
 * StructureWall class for runtime use
 */
export class StructureWallImpl extends StructureBase implements StructureWall {}

