import { C, type BodyPartType, type DirectionConstant } from '@skirmish/types';
import type { RuntimeObject, RuntimeSpawn, RuntimeCreep, RuntimeExtension, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcCreepCost, getOffsetsByDirection } from '../../utils.js';

export interface SpawnCreepScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
  generateId: () => string;
}

/**
 * Process spawn creep intent
 */
export function processSpawnCreep(
  spawn: RuntimeSpawn,
  intent: ObjectIntents['spawnCreep'],
  scope: SpawnCreepScope
): void {
  if (!intent?.body || !Array.isArray(intent.body)) return;
  if (spawn.type !== 'spawn') return;
  
  // Check if already spawning
  if (spawn.spawning) return;
  
  const { roomObjects, bulk, events, generateId } = scope;
  const store = spawn.store as unknown as Record<string, number>;
  
  // Validate body
  const body = intent.body as BodyPartType[];
  if (body.length === 0 || body.length > C.MAX_CREEP_SIZE) return;
  
  // Calculate cost
  let cost: number;
  try {
    cost = calcCreepCost(body);
  } catch {
    return; // Invalid body part
  }
  
  // Check energy (from spawn + extensions)
  let availableEnergy = store.energy || 0;
  
  // Add energy from extensions owned by same user
  for (const obj of roomObjects.values()) {
    if (obj.type === 'extension' && 'user' in obj && obj.user === spawn.user) {
      const ext = obj as RuntimeExtension;
      const extEnergy = (ext.store as unknown as Record<string, number>).energy || 0;
      availableEnergy += extEnergy;
    }
  }
  
  if (availableEnergy < cost) return;
  
  // Find spawn position
  let spawnX = spawn.x;
  let spawnY = spawn.y;
  
  // Use directions if specified, otherwise find first free adjacent tile
  const directions = spawn.directions?.length ? spawn.directions : 
    [C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT] as DirectionConstant[];
  
  for (const dir of directions) {
    const [dx, dy] = getOffsetsByDirection(dir);
    const newX = spawn.x + dx;
    const newY = spawn.y + dy;
    
    // Check if position is free
    let occupied = false;
    for (const obj of roomObjects.values()) {
      if (obj.x === newX && obj.y === newY && obj.type === 'creep') {
        occupied = true;
        break;
      }
    }
    
    if (!occupied) {
      spawnX = newX;
      spawnY = newY;
      break;
    }
  }
  
  // Create creep (will spawn after needTime ticks)
  const creepId = generateId();
  const bodyParts = body.map(type => ({ type, hits: C.BODYPART_HITS }));
  const hitsMax = bodyParts.length * C.BODYPART_HITS;
  
  // Create a simple store object for the creep
  const creepStore = { energy: 0 } as unknown as RuntimeCreep['store'];
  
  const newCreep = {
    _id: creepId,
    type: 'creep' as const,
    x: spawnX,
    y: spawnY,
    user: spawn.user,
    body: bodyParts,
    hits: hitsMax,
    hitsMax,
    fatigue: 0,
    my: true, // Will be set correctly when serialized for player
    spawning: true,
    store: creepStore,
    exists: true,
    id: creepId
  } as RuntimeCreep;
  
  bulk.insert(newCreep);
  
  // Consume energy from spawn first, then extensions
  let remaining = cost;
  const spawnEnergy = Math.min(store.energy || 0, remaining);
  store.energy = (store.energy || 0) - spawnEnergy;
  remaining -= spawnEnergy;
  bulk.update(spawn, { store: { energy: store.energy } } as Partial<RuntimeObject>);
  
  // Then from extensions (sorted by ID for deterministic order)
  if (remaining > 0) {
    const sortedObjects = Array.from(roomObjects.values()).sort((a, b) => a._id.localeCompare(b._id));
    for (const obj of sortedObjects) {
      if (remaining <= 0) break;
      if (obj.type === 'extension' && 'user' in obj && obj.user === spawn.user) {
        const ext = obj as RuntimeExtension;
        const extStore = ext.store as unknown as Record<string, number>;
        const extEnergy = Math.min(extStore.energy || 0, remaining);
        extStore.energy = (extStore.energy || 0) - extEnergy;
        remaining -= extEnergy;
        bulk.update(obj, { store: { energy: extStore.energy } } as Partial<RuntimeObject>);
      }
    }
  }
  
  // Set spawning state
  const spawnTime = body.length * C.CREEP_SPAWN_TIME;
  spawn.spawning = {
    needTime: spawnTime,
    remainingTime: spawnTime,
    creep: creepId
  };
  
  bulk.update(spawn, { spawning: spawn.spawning } as Partial<RuntimeObject>);
  
  events.push({
    type: C.EVENT_CREATE_CREEP,
    objectId: spawn._id,
    data: { creepId, body }
  });
}

/**
 * Calculate carry capacity from body
 */
function calcCarryCapacity(body: BodyPartType[]): number {
  return body.filter(type => type === C.CARRY).length * C.CARRY_CAPACITY;
}

