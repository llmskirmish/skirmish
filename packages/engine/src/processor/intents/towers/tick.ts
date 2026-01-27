import type { RuntimeObject, RuntimeTower, BulkOperation } from '../../../driver/types.js';

export interface TowerTickScope {
  bulk: BulkOperation;
}

/**
 * Process tower tick - reduce cooldown
 */
export function processTowerTick(
  tower: RuntimeTower,
  scope: TowerTickScope
): void {
  const { bulk } = scope;
  
  // Reduce cooldown
  if (tower.cooldown > 0) {
    tower.cooldown--;
    bulk.update(tower, { cooldown: tower.cooldown } as Partial<RuntimeObject>);
  }
}

