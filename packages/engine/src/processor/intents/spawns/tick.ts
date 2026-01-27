import type { RuntimeObject, RuntimeSpawn, RuntimeCreep, BulkOperation } from '../../../driver/types.js';

export interface SpawnTickScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
}

/**
 * Process spawn tick - progress spawning
 */
export function processSpawnTick(
  spawn: RuntimeSpawn,
  scope: SpawnTickScope
): void {
  const { roomObjects, bulk } = scope;
  
  if (!spawn.spawning) return;
  
  spawn.spawning.remainingTime--;
  
  if (spawn.spawning.remainingTime <= 0) {
    // Spawning complete
    const creep = roomObjects.get(spawn.spawning.creep);
    if (creep && creep.type === 'creep') {
      (creep as RuntimeCreep).spawning = false;
      bulk.update(creep, { spawning: false } as Partial<RuntimeObject>);
    }
    
    spawn.spawning = null;
  }
  
  bulk.update(spawn, { spawning: spawn.spawning } as Partial<RuntimeObject>);
}

