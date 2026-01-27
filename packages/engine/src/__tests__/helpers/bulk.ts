/**
 * Bulk operation mock for tests
 * Adapted from screeps/engine spec/helpers/mocks/bulk.js
 */

import type { RuntimeObject, BulkOperation } from '../../driver/types.js';

/**
 * Create a mock bulk operation that applies updates directly to objects
 */
export function createBulkMock(
  objects: Map<string, RuntimeObject>
): BulkOperation {
  const pendingUpdates: Array<{ obj: RuntimeObject; updates: Partial<RuntimeObject> }> = [];
  const pendingInserts: RuntimeObject[] = [];
  const pendingRemoves: string[] = [];

  return {
    update(obj: RuntimeObject, updates: Partial<RuntimeObject>): void {
      pendingUpdates.push({ obj, updates });
    },

    insert(obj: RuntimeObject): void {
      pendingInserts.push(obj);
    },

    remove(id: string): void {
      pendingRemoves.push(id);
    },

    execute(): void {
      // Apply updates
      for (const { obj, updates } of pendingUpdates) {
        Object.assign(obj, updates);
      }

      // Apply inserts
      for (const obj of pendingInserts) {
        objects.set(obj._id, obj);
      }

      // Apply removes
      for (const id of pendingRemoves) {
        objects.delete(id);
      }

      // Clear pending operations
      pendingUpdates.length = 0;
      pendingInserts.length = 0;
      pendingRemoves.length = 0;
    }
  };
}

