import type { Position } from './position.js';
import type { FindPathOptions } from '../utils.js';
import { 
  findClosestByPath as utilFindClosestByPath,
  findClosestByRange as utilFindClosestByRange,
  findInRange as utilFindInRange,
  findPath as utilFindPath,
  getRange as utilGetRange
} from '../utils.js';

/**
 * Basic prototype for game objects.
 * All objects and classes are inherited from this class.
 */
export interface GameObject extends Position {
  /** Object type identifier */
  type?: string;
  
  /** True if this object is live in the game at the moment */
  exists: boolean;

  /** The unique ID of this object */
  id: string | number;

  /** If defined, then this object will disappear after this number of ticks */
  ticksToDecay?: number;

  /** The X coordinate in the room */
  x: number;

  /** The Y coordinate in the room */
  y: number;

  /**
   * Find a position with the shortest path from this game object
   */
  findClosestByPath<T extends Position>(positions: T[], options?: FindPathOptions): T | null;

  /**
   * Find a position with the shortest linear distance from this game object
   */
  findClosestByRange<T extends Position>(positions: T[]): T | null;

  /**
   * Find all objects in the specified linear range
   */
  findInRange<T extends Position>(positions: T[], range: number): T[];

  /**
   * Find a path from this object to the given position
   */
  findPathTo(pos: Position, options?: FindPathOptions): Position[];

  /**
   * Get linear range between this and target object
   */
  getRangeTo(pos: Position): number;
}

/**
 * Base GameObject class for runtime use
 */
export class GameObjectBase implements GameObject {
  type?: string;
  exists = true;
  id: string | number = '';
  ticksToDecay?: number;
  x = 0;
  y = 0;

  /**
   * Find a position with the shortest path from this game object
   */
  findClosestByPath<T extends Position>(positions: T[], options?: FindPathOptions): T | null {
    return utilFindClosestByPath({ x: this.x, y: this.y }, positions, options);
  }

  /**
   * Find a position with the shortest linear distance from this game object
   */
  findClosestByRange<T extends Position>(positions: T[]): T | null {
    return utilFindClosestByRange({ x: this.x, y: this.y }, positions);
  }

  /**
   * Find all objects in the specified linear range
   */
  findInRange<T extends Position>(positions: T[], range: number): T[] {
    return utilFindInRange({ x: this.x, y: this.y }, positions, range);
  }

  /**
   * Find a path from this object to the given position
   */
  findPathTo(pos: Position, options?: FindPathOptions): Position[] {
    return utilFindPath({ x: this.x, y: this.y }, pos, options);
  }

  /**
   * Get linear range between this and target object
   */
  getRangeTo(pos: Position): number {
    return utilGetRange({ x: this.x, y: this.y }, pos);
  }
}

