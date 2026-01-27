/**
 * @skirmish/replay
 * 
 * Replay log format, types, and parsing utilities
 */

// Core serialized object types
export type {
  ActionTarget,
  ActionLog,
  SerializedObjectBase,
  SerializedBodyPart,
  SerializedStore,
  SerializedSpawning,
  SerializedCreep,
  SerializedSpawn,
  SerializedTower,
  SerializedExtension,
  SerializedContainer,
  SerializedSource,
  SerializedResource,
  SerializedWall,
  SerializedRampart,
  SerializedRoad,
  SerializedConstructionSite,
  SerializedGameObject,
  GameEvent,
  TerrainData
} from './types.js';

// Log format types
export type {
  LogPlayerInfo,
  LogMatchConfig,
  RawLogMeta,
  RawLogTick,
  VictoryData,
  RawLogResult,
  RawLogLine,
  ParsedReplayLog,
  ReplayData
} from './log-format.js';

// Parser functions
export { parseRawLog, toReplayData } from './parser.js';

