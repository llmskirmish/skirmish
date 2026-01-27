/**
 * Creep factory for tests
 * Adapted from screeps/engine spec/helpers/mocks/creeps.js
 */

import { C } from '@skirmish/types';
import type { RuntimeCreep, RuntimeBodyPart, RuntimeObject } from '../../driver/types.js';
import { generateId } from './common.js';

/**
 * Creep template definitions
 */
export type CreepTemplate = 
  | 'scout' 
  | 'noMove' 
  | 'fullSpeed' 
  | 'halfSpeed' 
  | 'lorry'
  | 'attacker'
  | 'rangedAttacker'
  | 'healer'
  | 'warrior';

interface CreepTemplateData {
  name: string;
  body: RuntimeBodyPart[];
  storeCapacity?: number;
}

const creepTemplates: Record<CreepTemplate, CreepTemplateData> = {
  scout: {
    name: 'scout',
    body: [
      { type: C.MOVE, hits: 100 }
    ]
  },
  noMove: {
    name: 'noMove',
    body: [
      { type: C.TOUGH, hits: 100 }
    ]
  },
  fullSpeed: {
    name: 'fullSpeed',
    body: [
      { type: C.TOUGH, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  },
  halfSpeed: {
    name: 'halfSpeed',
    body: [
      { type: C.TOUGH, hits: 100 },
      { type: C.TOUGH, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  },
  lorry: {
    name: 'lorry',
    body: [
      { type: C.CARRY, hits: 100 },
      { type: C.CARRY, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ],
    storeCapacity: 100
  },
  attacker: {
    name: 'attacker',
    body: [
      { type: C.ATTACK, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  },
  rangedAttacker: {
    name: 'rangedAttacker',
    body: [
      { type: C.RANGED_ATTACK, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  },
  healer: {
    name: 'healer',
    body: [
      { type: C.HEAL, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  },
  warrior: {
    name: 'warrior',
    body: [
      { type: C.ATTACK, hits: 100 },
      { type: C.RANGED_ATTACK, hits: 100 },
      { type: C.HEAL, hits: 100 },
      { type: C.TOUGH, hits: 100 },
      { type: C.MOVE, hits: 100 }
    ]
  }
};

/**
 * Create a test creep from a template
 */
export function createCreep(
  template: CreepTemplate,
  data: Partial<RuntimeCreep> & { x: number; y: number },
  objects?: Map<string, RuntimeObject>
): RuntimeCreep {
  const templateData = creepTemplates[template];
  
  const creep: RuntimeCreep = {
    _id: data._id ?? generateId(),
    type: 'creep',
    x: data.x,
    y: data.y,
    user: data.user ?? 'user1',
    body: data.body ?? templateData.body.map(p => ({ ...p })),
    hits: 0, // Will be calculated below
    hitsMax: 0,
    fatigue: data.fatigue ?? 0,
    my: data.my ?? true,
    spawning: data.spawning ?? false,
    store: data.store ?? { energy: 0 },
    storeCapacity: data.storeCapacity ?? templateData.storeCapacity,
    actionLog: {},
    ...data
  };

  // Calculate hits from body parts
  creep.hits = creep.body.reduce((sum, part) => sum + part.hits, 0);
  creep.hitsMax = creep.body.length * C.BODYPART_HITS;

  // Add to objects map if provided
  if (objects) {
    objects.set(creep._id, creep);
  }

  return creep;
}

/**
 * Create multiple creeps at once
 */
export function createCreeps(
  configs: Array<{ template: CreepTemplate; data: Partial<RuntimeCreep> & { x: number; y: number } }>,
  objects?: Map<string, RuntimeObject>
): RuntimeCreep[] {
  return configs.map(({ template, data }) => createCreep(template, data, objects));
}

