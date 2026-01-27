/**
 * @skirmish/types - TypeScript type definitions for Screeps Arena
 * 
 * This package provides types and constants compatible with the Screeps Arena API.
 */

// Re-export everything
export * from './constants.js';
export * from './prototypes/index.js';
export * from './path-finder.js';
export * from './utils.js';
export * from './visual.js';

// Also export as namespaces for Arena-style imports
import * as constants from './constants.js';
import * as prototypes from './prototypes/index.js';
import * as pathFinder from './path-finder.js';
import * as utils from './utils.js';
import * as visual from './visual.js';

export { constants, prototypes, pathFinder, utils, visual };

