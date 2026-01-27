import { C, type DirectionConstant } from '@skirmish/types';
import type { RuntimeSpawn, BulkOperation, RuntimeObject } from '../../../driver/types.js';

export interface SetDirectionsScope {
  bulk: BulkOperation;
}

/**
 * Process spawn setDirections intent
 */
export function processSetDirections(
  spawn: RuntimeSpawn,
  intent: { directions: number[] },
  scope: SetDirectionsScope
): void {
  if (!intent?.directions) return;
  if (spawn.type !== 'spawn') return;

  const { bulk } = scope;

  // Validate directions (must be 1-8)
  const validDirections = [C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT] as DirectionConstant[];
  const filteredDirections = intent.directions.filter(
    (d): d is DirectionConstant => validDirections.includes(d as DirectionConstant)
  );
  
  if (filteredDirections.length === 0) return;

  // Update spawn directions
  spawn.directions = filteredDirections;
  
  bulk.update(spawn, { directions: filteredDirections } as unknown as Partial<RuntimeObject>);
}

