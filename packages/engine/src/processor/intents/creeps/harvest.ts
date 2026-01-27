import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, RuntimeSource, BulkOperation, GameEvent, ObjectIntents } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist, calcResources, calcStoreCapacity } from '../../utils.js';

export interface HarvestScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process creep harvest intent
 */
export function processHarvest(
  creep: RuntimeCreep,
  intent: ObjectIntents['harvest'],
  scope: HarvestScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events } = scope;

  // Get target
  const target = roomObjects.get(intent.id);
  if (!target) return;

  // Check range (must be adjacent)
  if (dist(creep, target) > 1) return;

  // Only harvest sources in Arena
  if (target.type !== 'source') return;

  const source = target as RuntimeSource;
  if (!source.energy) return;

  // Calculate harvest amount
  const harvestPower = calcBodyEffectiveness(creep.body, C.WORK, 'harvest', C.HARVEST_POWER);
  if (harvestPower === 0) return;

  const amount = Math.min(source.energy, harvestPower);

  // Update source
  source.energy -= amount;
  bulk.update(source, { energy: source.energy } as Partial<RuntimeObject>);

  // Update creep store
  const store = creep.store as unknown as Record<string, number>;
  store.energy = (store.energy || 0) + amount;
  bulk.update(creep, { store: { energy: store.energy } } as Partial<RuntimeObject>);

  // Drop excess if over capacity
  const totalResources = calcResources(creep);
  const capacity = calcStoreCapacity(creep.body);
  if (totalResources > capacity) {
    const excess = Math.min(store.energy, totalResources - capacity);
    store.energy -= excess;
    bulk.update(creep, { store: { energy: store.energy } } as Partial<RuntimeObject>);
    
    // Create dropped resource (simplified - just log event)
    events.push({
      type: C.EVENT_DROP,
      objectId: creep._id,
      data: { resourceType: 'energy', amount: excess }
    });
  }

  // Set actionLog on harvester (Screeps pattern)
  if (creep.actionLog) {
    creep.actionLog.harvest = { x: source.x, y: source.y };
  }

  creep._harvest = true;

  events.push({
    type: C.EVENT_HARVEST,
    objectId: creep._id,
    data: { sourceId: source._id, amount }
  });
}

