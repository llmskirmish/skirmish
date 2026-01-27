import { StructureBase, type Structure } from './structure.js';

/**
 * Decreases movement cost to 1. Using roads allows creating creeps with less MOVE body parts.
 */
export interface StructureRoad extends Structure {}

/**
 * StructureRoad class for runtime use
 */
export class StructureRoadImpl extends StructureBase implements StructureRoad {}

