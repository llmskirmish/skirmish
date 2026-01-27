import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, BulkOperation, GameEvent, RuntimeConstructionSite } from '../../../driver/types.js';
import { calcBodyEffectiveness, dist } from '../../utils.js';

export interface BuildScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
  generateId: () => string;
}

/**
 * Process creep build intent
 */
export function processBuild(
  creep: RuntimeCreep,
  intent: { id: string },
  scope: BuildScope
): void {
  if (!intent?.id) return;
  if (creep.type !== 'creep') return;
  if (creep.spawning) return;

  const { roomObjects, bulk, events, generateId } = scope;

  // Get target construction site
  const target = roomObjects.get(intent.id) as RuntimeConstructionSite | undefined;
  if (!target || target.type !== 'constructionSite') return;

  // Check range (must be within 3 squares)
  if (dist(creep, target) > 3) return;

  // Check for WORK body parts
  const buildPower = calcBodyEffectiveness(creep.body, C.WORK, 'build', C.BUILD_POWER);
  if (buildPower === 0) return;

  // Check if creep has energy
  const energy = creep.store?.[C.RESOURCE_ENERGY] || 0;
  if (energy === 0) return;

  // Calculate actual build amount (limited by energy and remaining progress)
  const remainingProgress = target.progressTotal - target.progress;
  const buildAmount = Math.min(buildPower, energy, remainingProgress);

  if (buildAmount === 0) return;

  // Deduct energy from creep
  creep.store[C.RESOURCE_ENERGY] = energy - buildAmount;
  bulk.update(creep, { store: creep.store });

  // Set actionLog on builder (Screeps pattern)
  if (creep.actionLog) {
    creep.actionLog.build = { x: target.x, y: target.y };
  }

  // Add progress to construction site
  target.progress += buildAmount;
  bulk.update(target, { progress: target.progress });

  // Check if construction is complete
  if (target.progress >= target.progressTotal) {
    // Remove construction site and create the structure
    bulk.remove(target._id);

    // Create the actual structure
    const structureId = generateId();
    const structure = {
      _id: structureId,
      type: target.structureType,
      x: target.x,
      y: target.y,
      user: target.user,
      hits: C.CONSTRUCTION_COST[target.structureType] || 0,
      hitsMax: C.CONSTRUCTION_COST[target.structureType] || 0,
    } as RuntimeObject;
    bulk.insert(structure);

    events.push({
      type: C.EVENT_BUILD,
      objectId: creep._id,
      data: { targetId: structureId, structureType: target.structureType }
    });
  } else {
    events.push({
      type: C.EVENT_BUILD,
      objectId: creep._id,
      data: { targetId: target._id, amount: buildAmount }
    });
  }
}

