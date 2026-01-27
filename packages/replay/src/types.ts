/**
 * Core types for serialized game state in replays
 */

import type { BodyPartType, DirectionConstant } from '@skirmish/types';

// ============================================
// Action Log - What happened this tick
// ============================================

/**
 * Target reference for actions
 */
export interface ActionTarget {
  x: number;
  y: number;
  id?: string;
}

/**
 * Actions performed by an object this tick (for rendering)
 */
export interface ActionLog {
  attack?: ActionTarget;
  rangedAttack?: ActionTarget;
  rangedMassAttack?: boolean;
  heal?: ActionTarget;
  rangedHeal?: ActionTarget;
  harvest?: ActionTarget;
  build?: ActionTarget;
  repair?: ActionTarget;
  transferEnergy?: ActionTarget;
  attacked?: boolean;
  healed?: boolean;
}

// ============================================
// Serialized Game Objects
// ============================================

/**
 * Base properties all serialized game objects have
 */
export interface SerializedObjectBase {
  _id: string;
  type: string;
  x: number;
  y: number;
  user?: string;
  actionLog?: ActionLog;
  exists?: boolean;
}

/**
 * Body part with current hits
 */
export interface SerializedBodyPart {
  type: BodyPartType;
  hits: number;
}

/**
 * Store contents (resources)
 */
export interface SerializedStore {
  energy?: number;
  [resource: string]: number | undefined;
}

/**
 * Spawning state
 */
export interface SerializedSpawning {
  needTime: number;
  remainingTime: number;
  creep: string;
}

/**
 * Serialized creep object
 */
export interface SerializedCreep extends SerializedObjectBase {
  type: 'creep';
  hits: number;
  hitsMax: number;
  fatigue: number;
  my: boolean;
  spawning: boolean;
  store: SerializedStore;
  storeCapacity?: number;
  body: SerializedBodyPart[];
}

/**
 * Serialized spawn object
 */
export interface SerializedSpawn extends SerializedObjectBase {
  type: 'spawn';
  hits: number;
  hitsMax: number;
  store: SerializedStore;
  storeCapacity: number;
  spawning: SerializedSpawning | null;
  directions: DirectionConstant[];
}

/**
 * Serialized tower object
 */
export interface SerializedTower extends SerializedObjectBase {
  type: 'tower';
  hits: number;
  hitsMax: number;
  store: SerializedStore;
  storeCapacity: number;
  cooldown: number;
}

/**
 * Serialized extension object
 */
export interface SerializedExtension extends SerializedObjectBase {
  type: 'extension';
  hits: number;
  hitsMax: number;
  store: SerializedStore;
  storeCapacity: number;
}

/**
 * Serialized container object
 */
export interface SerializedContainer extends SerializedObjectBase {
  type: 'container';
  hits: number;
  hitsMax: number;
  store: SerializedStore;
  storeCapacity: number;
}

/**
 * Serialized source object
 */
export interface SerializedSource extends SerializedObjectBase {
  type: 'source';
  energy: number;
  energyCapacity: number;
}

/**
 * Serialized resource (dropped)
 */
export interface SerializedResource extends SerializedObjectBase {
  type: 'resource';
  resourceType: string;
  amount: number;
}

/**
 * Serialized wall
 */
export interface SerializedWall extends SerializedObjectBase {
  type: 'constructedWall';
  hits: number;
  hitsMax: number;
}

/**
 * Serialized rampart
 */
export interface SerializedRampart extends SerializedObjectBase {
  type: 'rampart';
  hits: number;
  hitsMax: number;
}

/**
 * Serialized road
 */
export interface SerializedRoad extends SerializedObjectBase {
  type: 'road';
  hits: number;
  hitsMax: number;
}

/**
 * Serialized construction site
 */
export interface SerializedConstructionSite extends SerializedObjectBase {
  type: 'constructionSite';
  structureType: string;
  progress: number;
  progressTotal: number;
}

/**
 * Union of all known serialized object types
 */
export type SerializedGameObject =
  | SerializedCreep
  | SerializedSpawn
  | SerializedTower
  | SerializedExtension
  | SerializedContainer
  | SerializedSource
  | SerializedResource
  | SerializedWall
  | SerializedRampart
  | SerializedRoad
  | SerializedConstructionSite
  | SerializedObjectBase; // Fallback for unknown types

// ============================================
// Game Events
// ============================================

/**
 * Event that occurred during a tick
 */
export interface GameEvent {
  type: number;
  objectId?: string;
  data?: Record<string, unknown>;
}

// ============================================
// Terrain
// ============================================

/**
 * Terrain data for a map
 */
export interface TerrainData {
  width: number;
  height: number;
  data: number[];
}

