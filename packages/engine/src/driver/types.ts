import type { 
  GameObject, 
  Creep,
  StructureSpawn,
  StructureTower,
  Source,
  Resource,
  ConstructionSite,
  Position,
  BodyPart,
  Store
} from '@skirmish/types';
import type { TerrainType, BodyPartType, DirectionConstant } from '@skirmish/types';

/**
 * Runtime body part with _oldHits for Screeps pattern
 * _oldHits preserves the hits value from tick start so actions can complete
 * even if the creep takes damage mid-tick
 */
export interface RuntimeBodyPart extends BodyPart {
  _oldHits?: number;
}

/**
 * Player information in a match
 */
export interface Player {
  id: string;
  name: string;
  slug?: string;
  script: string;
  memory?: string;
}

/**
 * Internal action log for visual effects (set during intent processing)
 * Following Screeps pattern: each action is set directly when it happens
 * Note: This stores coordinates for the attacker/healer position (for visual effects)
 */
export interface InternalActionLog {
  attack?: { x: number; y: number };
  rangedAttack?: { x: number; y: number };
  rangedMassAttack?: Record<string, never>;
  heal?: { x: number; y: number };
  rangedHeal?: { x: number; y: number };
  harvest?: { x: number; y: number };
  build?: { x: number; y: number };
  transferEnergy?: { x: number; y: number };
  attacked?: { x: number; y: number };
  healed?: { x: number; y: number };
}

/**
 * Runtime game object - extends the type with internal properties
 * Index signature allows compatibility with renderer's GameObjectState
 */
export interface RuntimeGameObject extends GameObject {
  _id: string;
  type: string;
  user?: string;
  room?: string;
  actionLog?: InternalActionLog;
  _actionLog?: InternalActionLog; // Previous tick's actionLog (for change detection)
  [key: string]: unknown;
}

/**
 * Runtime creep object with additional engine properties
 */
export interface RuntimeCreep extends RuntimeGameObject {
  type: 'creep';
  body: RuntimeBodyPart[];
  hits: number;
  hitsMax: number;
  fatigue: number;
  my: boolean;
  spawning: boolean;
  store: Record<string, number>;
  storeCapacity?: number;
  _move?: { direction: DirectionConstant };
  _attack?: boolean;
  _heal?: boolean;
  _rangedAttack?: boolean;
  _rangedHeal?: boolean;
  _rangedMassAttack?: boolean;
  _harvest?: boolean;
  _pull?: RuntimeCreep;
  _pulled?: boolean;
  _pulledBy?: string; // ID of creep pulling this one
  _pulling?: string;  // ID of creep being pulled
  ageTime?: number;
}

/**
 * Runtime spawn object
 */
export interface RuntimeSpawn extends RuntimeGameObject {
  type: 'spawn';
  hits: number;
  hitsMax: number;
  my?: boolean;
  store: Record<string, number>;
  storeCapacity?: number;
  spawning: SpawningState | null;
  directions: DirectionConstant[];
}

export interface SpawningState {
  needTime: number;
  remainingTime: number;
  creep: string; // creep id
}

/**
 * Runtime tower object
 */
export interface RuntimeTower extends RuntimeGameObject {
  type: 'tower';
  hits: number;
  hitsMax: number;
  my?: boolean;
  store: Record<string, number>;
  storeCapacity?: number;
  cooldown: number;
}

/**
 * Runtime source object
 */
export interface RuntimeSource extends RuntimeGameObject {
  type: 'source';
  energy: number;
  energyCapacity: number;
  nextRegenTime?: number;
}

/**
 * Runtime resource (dropped) object
 */
export interface RuntimeResource extends RuntimeGameObject {
  type: 'energy' | string;
  amount: number;
  resourceType: string;
}

/**
 * Runtime construction site object
 */
export interface RuntimeConstructionSite extends RuntimeGameObject {
  type: 'constructionSite';
  progress: number;
  progressTotal: number;
  structureType: string;
  my?: boolean;
}

/**
 * Runtime wall object
 */
export interface RuntimeWall extends RuntimeGameObject {
  type: 'constructedWall';
  hits: number;
  hitsMax: number;
}

/**
 * Runtime rampart object
 */
export interface RuntimeRampart extends RuntimeGameObject {
  type: 'rampart';
  hits: number;
  hitsMax: number;
  my?: boolean;
}

/**
 * Runtime container object
 */
export interface RuntimeContainer extends RuntimeGameObject {
  type: 'container';
  hits: number;
  hitsMax: number;
  my?: boolean;
  store: Record<string, number>;
  storeCapacity?: number;
}

/**
 * Runtime extension object
 */
export interface RuntimeExtension extends RuntimeGameObject {
  type: 'extension';
  hits: number;
  hitsMax: number;
  my?: boolean;
  store: Record<string, number>;
  storeCapacity?: number;
}

/**
 * Runtime road object
 */
export interface RuntimeRoad extends RuntimeGameObject {
  type: 'road';
  hits: number;
  hitsMax: number;
}

/**
 * Union of all runtime object types
 */
/**
 * Runtime structure type (anything with hits)
 */
export type RuntimeStructure = 
  | RuntimeSpawn 
  | RuntimeTower
  | RuntimeWall
  | RuntimeRampart
  | RuntimeContainer
  | RuntimeExtension
  | RuntimeRoad;

/**
 * Union of all runtime object types
 */
export type RuntimeObject = 
  | RuntimeCreep 
  | RuntimeSpawn 
  | RuntimeTower
  | RuntimeSource
  | RuntimeResource
  | RuntimeConstructionSite
  | RuntimeWall
  | RuntimeRampart
  | RuntimeContainer
  | RuntimeExtension
  | RuntimeRoad;

/**
 * Arena terrain cell
 */
export type TerrainCell = TerrainType;

/**
 * Arena terrain data - a 50x50 grid
 */
export interface TerrainData {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Match configuration
 */
export interface MatchConfig {
  arenaWidth: number;
  arenaHeight: number;
  maxTicks: number;
  tickDuration: number;
  players: Player[];
  terrain?: TerrainData;
  initialObjects?: RuntimeObject[];
  seed?: number;
}

/**
 * Match state at a given tick
 */
export interface MatchState {
  tick: number;
  objects: Map<string, RuntimeObject>;
  terrain: TerrainData;
  players: Map<string, Player>;
  events: GameEvent[];
}

/**
 * Game event types
 */
export interface GameEvent {
  type: number;
  objectId?: string;
  data?: Record<string, unknown>;
}

/**
 * User intents for a tick
 */
export interface UserIntents {
  objects: Record<string, ObjectIntents>;
}

/**
 * Intents for a single object
 */
export interface ObjectIntents {
  // Creep movement & combat
  move?: { direction: DirectionConstant };
  attack?: { id: string };
  rangedAttack?: { id: string };
  rangedMassAttack?: Record<string, never>;
  heal?: { id: string };
  rangedHeal?: { id: string };
  
  // Creep resource operations
  harvest?: { id: string };
  build?: { id: string };
  transfer?: { id: string; resourceType: string; amount?: number };
  withdraw?: { id: string; resourceType: string; amount?: number };
  drop?: { resourceType: string; amount?: number };
  pickup?: { id: string };
  pull?: { id: string };
  
  // Spawn operations
  spawnCreep?: { body: BodyPartType[] };
  cancelSpawning?: Record<string, never>;
  setDirections?: { directions: number[] };
  
  // Tower operations
  towerAttack?: { id: string };
  towerHeal?: { id: string };
  
  // Construction operations
  createConstructionSite?: { x: number; y: number; structureType: string; id: string };
  removeConstructionSite?: Record<string, never>;
}

/**
 * Room intents from all users
 */
export interface RoomIntents {
  users: Record<string, UserIntents>;
}

/**
 * Bulk write operation
 */
export interface BulkOperation {
  update(obj: RuntimeObject, updates: Partial<RuntimeObject>): void;
  insert(obj: RuntimeObject): void;
  remove(id: string): void;
  execute(): void;
}

