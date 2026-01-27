/**
 * Common test helpers
 * Adapted from screeps/engine spec/helpers/mocks/common.js
 */

import { IdGenerator } from '../../driver/IdGenerator.js';

const idGen = new IdGenerator();

/**
 * Generate a unique ID for test objects
 */
export function generateId(): string {
  return idGen.generateId();
}

/**
 * Reset the ID counter between tests
 */
export function resetIds(): void {
  idGen.reset();
}

