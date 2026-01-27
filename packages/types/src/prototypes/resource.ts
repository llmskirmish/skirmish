import { GameObjectBase, type GameObject } from './game-object.js';
import type { ResourceType } from '../constants.js';

/**
 * A dropped piece of resource. Dropped resource pile decays for ceil(amount/1000) units per tick.
 */
export interface Resource extends GameObject {
  /** The amount of dropped resource */
  amount: number;

  /** The type of dropped resource (one of RESOURCE_* constants) */
  resourceType: ResourceType;
}

/**
 * Resource class for runtime use
 */
export class ResourceImpl extends GameObjectBase implements Resource {
  amount = 0;
  resourceType: ResourceType = 'energy';
}

