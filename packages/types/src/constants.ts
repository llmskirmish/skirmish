/**
 * Screeps Arena API Compatible Constants
 * 
 * These constants define the game rules and mechanics for Arena-style gameplay.
 * Values are based on Screeps Arena documentation and may differ from Screeps World.
 */

// Result codes
export const OK = 0;
export const ERR_NOT_OWNER = -1;
export const ERR_NO_PATH = -2;
export const ERR_NAME_EXISTS = -3;
export const ERR_BUSY = -4;
export const ERR_NOT_FOUND = -5;
export const ERR_NOT_ENOUGH_ENERGY = -6;
export const ERR_NOT_ENOUGH_RESOURCES = -6;
export const ERR_INVALID_TARGET = -7;
export const ERR_FULL = -8;
export const ERR_NOT_IN_RANGE = -9;
export const ERR_INVALID_ARGS = -10;
export const ERR_TIRED = -11;
export const ERR_NO_BODYPART = -12;
export const ERR_NOT_ENOUGH_EXTENSIONS = -6;

// Body part types
export const MOVE = 'move' as const;
export const RANGED_ATTACK = 'ranged_attack' as const;
export const HEAL = 'heal' as const;
export const ATTACK = 'attack' as const;
export const CARRY = 'carry' as const;
export const TOUGH = 'tough' as const;
export const WORK = 'work' as const;

export type BodyPartType = 
  | typeof MOVE 
  | typeof RANGED_ATTACK 
  | typeof HEAL 
  | typeof ATTACK 
  | typeof CARRY 
  | typeof TOUGH 
  | typeof WORK;

// Direction constants
export const TOP = 1;
export const TOP_RIGHT = 2;
export const RIGHT = 3;
export const BOTTOM_RIGHT = 4;
export const BOTTOM = 5;
export const BOTTOM_LEFT = 6;
export const LEFT = 7;
export const TOP_LEFT = 8;

export type DirectionConstant = 
  | typeof TOP 
  | typeof TOP_RIGHT 
  | typeof RIGHT 
  | typeof BOTTOM_RIGHT 
  | typeof BOTTOM 
  | typeof BOTTOM_LEFT 
  | typeof LEFT 
  | typeof TOP_LEFT;

// Terrain types
export const TERRAIN_PLAIN = 0;
export const TERRAIN_WALL = 1;
export const TERRAIN_SWAMP = 2;

export type TerrainType = 
  | typeof TERRAIN_PLAIN 
  | typeof TERRAIN_WALL 
  | typeof TERRAIN_SWAMP;

// Structure types
export const STRUCTURE_SPAWN = 'spawn' as const;
export const STRUCTURE_EXTENSION = 'extension' as const;
export const STRUCTURE_ROAD = 'road' as const;
export const STRUCTURE_WALL = 'constructedWall' as const;
export const STRUCTURE_RAMPART = 'rampart' as const;
export const STRUCTURE_KEEPER_LAIR = 'keeperLair' as const;
export const STRUCTURE_PORTAL = 'portal' as const;
export const STRUCTURE_CONTROLLER = 'controller' as const;
export const STRUCTURE_LINK = 'link' as const;
export const STRUCTURE_STORAGE = 'storage' as const;
export const STRUCTURE_TOWER = 'tower' as const;
export const STRUCTURE_OBSERVER = 'observer' as const;
export const STRUCTURE_POWER_BANK = 'powerBank' as const;
export const STRUCTURE_POWER_SPAWN = 'powerSpawn' as const;
export const STRUCTURE_EXTRACTOR = 'extractor' as const;
export const STRUCTURE_LAB = 'lab' as const;
export const STRUCTURE_TERMINAL = 'terminal' as const;
export const STRUCTURE_CONTAINER = 'container' as const;
export const STRUCTURE_NUKER = 'nuker' as const;
export const STRUCTURE_FACTORY = 'factory' as const;
export const STRUCTURE_INVADER_CORE = 'invaderCore' as const;
export const STRUCTURE_CREEP = 'creep' as const;
export const STRUCTURE_CONSTRUCTED_WALL = 'constructedWall' as const;
export const SOURCE = 'source' as const;
export const RESOURCE = 'resource' as const;
export const CONSTRUCTION_SITE = 'constructionSite' as const;

// Combat stats
export const BODYPART_HITS = 100;
export const RANGED_ATTACK_POWER = 10;
export const RANGED_ATTACK_DISTANCE_RATE: Record<number, number> = {
  1: 1,
  2: 0.4,
  3: 0.1
};
export const ATTACK_POWER = 30;
export const HEAL_POWER = 12;
export const RANGED_HEAL_POWER = 4;
export const CARRY_CAPACITY = 50;
export const HARVEST_POWER = 2;
export const BUILD_POWER = 5;

// Obstacle types for pathfinding
export const OBSTACLE_OBJECT_TYPES: string[] = [
  'spawn',
  'creep',
  'wall',
  'source',
  'tower',
  'extension',
  'container'
];

// Tower stats
export const TOWER_ENERGY_COST = 10;
export const TOWER_RANGE = 50;
export const TOWER_HITS = 3000;
export const TOWER_CAPACITY = 50;
export const TOWER_POWER_ATTACK = 150;
export const TOWER_POWER_HEAL = 100;
export const TOWER_OPTIMAL_RANGE = 5;
export const TOWER_FALLOFF_RANGE = 20;
export const TOWER_FALLOFF = 0.75;
export const TOWER_COOLDOWN = 10;

// Body part costs
export const BODYPART_COST: Record<BodyPartType, number> = {
  [MOVE]: 50,
  [WORK]: 100,
  [CARRY]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [TOUGH]: 10
};

// Creep stats
export const MAX_CREEP_SIZE = 50;
export const CREEP_SPAWN_TIME = 3;

// Resources
export const RESOURCE_ENERGY = 'energy' as const;
export type ResourceType = typeof RESOURCE_ENERGY | string;

export const RESOURCES_ALL: ResourceType[] = [RESOURCE_ENERGY];

// Source stats
export const SOURCE_ENERGY_REGEN = 10;

// Resource decay
export const RESOURCE_DECAY = 1000;

// Source stats
export const SOURCE_ENERGY_CAPACITY = 3000;

// Construction
export const MAX_CONSTRUCTION_SITES = 10;

export const CONSTRUCTION_COST: Record<string, number> = {
  spawn: 15000,
  extension: 3000,
  road: 300,
  constructedWall: 1,
  rampart: 1,
  container: 5000,
  tower: 5000
};

export const CONSTRUCTION_COST_ROAD_SWAMP_RATIO = 5;
export const CONSTRUCTION_COST_ROAD_WALL_RATIO = 150;

// Structure stats
export const CONTAINER_HITS = 300;
export const CONTAINER_CAPACITY = 2000;

export const WALL_HITS = 10000;
export const WALL_HITS_MAX = 10000;

export const RAMPART_HITS = 10000;
export const RAMPART_HITS_MAX = 10000;

export const ROAD_HITS = 500;
export const ROAD_WEAROUT = 1;

export const EXTENSION_HITS = 100;
export const EXTENSION_ENERGY_CAPACITY = 100;

export const SPAWN_ENERGY_CAPACITY = 1000;
export const SPAWN_HITS = 3000;

// Player IDs
export const PLAYER_1 = 'player1' as const;
export const PLAYER_2 = 'player2' as const;
export const PLAYER_NEUTRAL = 'neutral' as const;

export type PlayerId = typeof PLAYER_1 | typeof PLAYER_2 | typeof PLAYER_NEUTRAL;

// Player colors for visualization
// Player 1: Blue, Player 2: Red (matched brightness/saturation)
export const PLAYER_COLORS: Record<PlayerId, number> = {
  [PLAYER_1]: 0x3695F4,  // Blue
  [PLAYER_2]: 0xF44336,  // Red
  [PLAYER_NEUTRAL]: 0x888888   // Gray
} as const;

// Player colors as CSS hex strings (for frontend/SVG use)
export const PLAYER_COLORS_CSS: Record<PlayerId, string> = {
  [PLAYER_1]: '#3695F4',  // Blue
  [PLAYER_2]: '#F44336',  // Red
  [PLAYER_NEUTRAL]: '#888888'   // Gray
} as const;

// Event types
export const EVENT_ATTACK = 1;
export const EVENT_OBJECT_DESTROYED = 2;
export const EVENT_ATTACK_CONTROLLER = 3;
export const EVENT_BUILD = 4;
export const EVENT_HARVEST = 5;
export const EVENT_HEAL = 6;
export const EVENT_RESERVE_CONTROLLER = 8;
export const EVENT_UPGRADE_CONTROLLER = 9;
export const EVENT_EXIT = 10;
export const EVENT_POWER = 11;
export const EVENT_TRANSFER = 12;
export const EVENT_WITHDRAW = 13;
export const EVENT_PICKUP = 14;
export const EVENT_DROP = 15;
export const EVENT_PULL = 16;
export const EVENT_DESTROY = 18;
export const EVENT_CREATE_CREEP = 19;

// All constants as a single object for easy access
export const C = {
  OK,
  ERR_NOT_OWNER,
  ERR_NO_PATH,
  ERR_NAME_EXISTS,
  ERR_BUSY,
  ERR_NOT_FOUND,
  ERR_NOT_ENOUGH_ENERGY,
  ERR_NOT_ENOUGH_RESOURCES,
  ERR_INVALID_TARGET,
  ERR_FULL,
  ERR_NOT_IN_RANGE,
  ERR_INVALID_ARGS,
  ERR_TIRED,
  ERR_NO_BODYPART,
  ERR_NOT_ENOUGH_EXTENSIONS,
  MOVE,
  RANGED_ATTACK,
  HEAL,
  ATTACK,
  CARRY,
  TOUGH,
  WORK,
  TOP,
  TOP_RIGHT,
  RIGHT,
  BOTTOM_RIGHT,
  BOTTOM,
  BOTTOM_LEFT,
  LEFT,
  TOP_LEFT,
  TERRAIN_PLAIN,
  TERRAIN_WALL,
  TERRAIN_SWAMP,
  // Structure types
  STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_WALL,
  STRUCTURE_RAMPART,
  STRUCTURE_KEEPER_LAIR,
  STRUCTURE_PORTAL,
  STRUCTURE_CONTROLLER,
  STRUCTURE_LINK,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_OBSERVER,
  STRUCTURE_POWER_BANK,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_CONTAINER,
  STRUCTURE_NUKER,
  STRUCTURE_FACTORY,
  STRUCTURE_INVADER_CORE,
  STRUCTURE_CREEP,
  STRUCTURE_CONSTRUCTED_WALL,
  SOURCE,
  RESOURCE,
  CONSTRUCTION_SITE,
  // Combat stats
  BODYPART_HITS,
  RANGED_ATTACK_POWER,
  RANGED_ATTACK_DISTANCE_RATE,
  ATTACK_POWER,
  HEAL_POWER,
  RANGED_HEAL_POWER,
  CARRY_CAPACITY,
  HARVEST_POWER,
  BUILD_POWER,
  OBSTACLE_OBJECT_TYPES,
  TOWER_ENERGY_COST,
  TOWER_RANGE,
  TOWER_HITS,
  TOWER_CAPACITY,
  TOWER_POWER_ATTACK,
  TOWER_POWER_HEAL,
  TOWER_OPTIMAL_RANGE,
  TOWER_FALLOFF_RANGE,
  TOWER_FALLOFF,
  TOWER_COOLDOWN,
  BODYPART_COST,
  MAX_CREEP_SIZE,
  CREEP_SPAWN_TIME,
  RESOURCE_ENERGY,
  RESOURCES_ALL,
  SOURCE_ENERGY_REGEN,
  SOURCE_ENERGY_CAPACITY,
  RESOURCE_DECAY,
  MAX_CONSTRUCTION_SITES,
  CONSTRUCTION_COST,
  CONSTRUCTION_COST_ROAD_SWAMP_RATIO,
  CONSTRUCTION_COST_ROAD_WALL_RATIO,
  CONTAINER_HITS,
  CONTAINER_CAPACITY,
  WALL_HITS,
  WALL_HITS_MAX,
  RAMPART_HITS,
  RAMPART_HITS_MAX,
  ROAD_HITS,
  ROAD_WEAROUT,
  EXTENSION_HITS,
  EXTENSION_ENERGY_CAPACITY,
  SPAWN_ENERGY_CAPACITY,
  SPAWN_HITS,
  // Events
  EVENT_ATTACK,
  EVENT_OBJECT_DESTROYED,
  EVENT_ATTACK_CONTROLLER,
  EVENT_BUILD,
  EVENT_HARVEST,
  EVENT_HEAL,
  EVENT_RESERVE_CONTROLLER,
  EVENT_UPGRADE_CONTROLLER,
  EVENT_EXIT,
  EVENT_POWER,
  EVENT_TRANSFER,
  EVENT_WITHDRAW,
  EVENT_PICKUP,
  EVENT_DROP,
  EVENT_PULL,
  EVENT_DESTROY,
  EVENT_CREATE_CREEP,
  // Players
  PLAYER_1,
  PLAYER_2,
  PLAYER_NEUTRAL,
  PLAYER_COLORS,
  PLAYER_COLORS_CSS
} as const;

