// Re-export all prototypes
export type { Position } from './position.js';
export { type GameObject, GameObjectBase } from './game-object.js';
export { type Structure, StructureBase } from './structure.js';
export { type OwnedStructure, OwnedStructureBase } from './owned-structure.js';
export type { Store } from './store.js';

// Creep
export { 
  type Creep, 
  type BodyPart,
  CreepImpl,
  type CreepAttackResult,
  type CreepBuildResult,
  type CreepDropResult,
  type CreepHarvestResult,
  type CreepHealResult,
  type CreepMoveResult,
  type CreepPickupResult,
  type CreepPullResult,
  type CreepRangedAttackResult,
  type CreepRangedHealResult,
  type CreepRangedMassAttackResult,
  type CreepTransferResult,
  type CreepWithdrawResult
} from './creep.js';

// Structures
export { 
  type StructureSpawn, 
  type Spawning,
  type SpawnCreepResult,
  type SetDirectionsResult,
  StructureSpawnImpl 
} from './spawn.js';

export { 
  type StructureTower,
  type TowerAttackResult,
  type TowerHealResult,
  StructureTowerImpl 
} from './tower.js';

export { type StructureContainer, StructureContainerImpl } from './container.js';
export { type StructureExtension, StructureExtensionImpl } from './extension.js';
export { type StructureWall, StructureWallImpl } from './wall.js';
export { type StructureRampart, StructureRampartImpl } from './rampart.js';
export { type StructureRoad, StructureRoadImpl } from './road.js';

// Other game objects
export { type Source, SourceImpl } from './source.js';
export { type Resource, ResourceImpl } from './resource.js';
export { type ConstructionSite, ConstructionSiteImpl } from './construction-site.js';

