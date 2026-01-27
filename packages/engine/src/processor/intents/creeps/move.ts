import { C, type DirectionConstant } from '@skirmish/types';
import type { RuntimeObject, RuntimeCreep, ObjectIntents, TerrainData } from '../../../driver/types.js';
import { getOffsetsByDirection } from '../../utils.js';

export interface MoveScope {
  roomObjects: Map<string, RuntimeObject>;
  terrain: TerrainData;
}

/** Pending move with calculated priority */
interface PendingMove {
  x: number;
  y: number;
  creep: RuntimeCreep;
  movePower: number;
}

/** Movement registry for collision resolution */
export interface MovementRegistry {
  pending: Map<string, PendingMove>;
  addMove(creep: RuntimeCreep, dx: number, dy: number): void;
  resolve(gameTime: number): Map<string, { x: number; y: number }>;
}

/**
 * Calculate move power for a creep.
 * Move power is the sum of active MOVE body parts.
 * Each active MOVE part contributes to the creep's ability to win movement conflicts.
 */
function calcMovePower(creep: RuntimeCreep): number {
  let movePower = 0;
  for (const part of creep.body) {
    if (part.type === C.MOVE && part.hits > 0) {
      movePower++;
    }
  }
  return movePower;
}

/**
 * Create a movement registry for a tick
 * @param gameTime - Current tick number, used for fair player alternation
 */
export function createMovementRegistry(
  roomObjects: Map<string, RuntimeObject>,
  terrain: TerrainData,
  gameTime: number = 0
): MovementRegistry {
  const pending = new Map<string, PendingMove>();
  
  return {
    pending,
    
    addMove(creep: RuntimeCreep, dx: number, dy: number) {
      const newX = Math.max(0, Math.min(terrain.width - 1, creep.x + dx));
      const newY = Math.max(0, Math.min(terrain.height - 1, creep.y + dy));
      
      // Check for wall terrain
      if (terrain.data[newY * terrain.width + newX] === C.TERRAIN_WALL) {
        return;
      }
      
      // Check for blocking structures
      for (const obj of roomObjects.values()) {
        if (obj.x === newX && obj.y === newY) {
          if (obj.type === 'constructedWall') return;
          if (obj.type === 'spawn') return;
          if (obj.type === 'tower') return;
          if (obj.type === 'extension') return;
          // Ramparts block enemies
          if (obj.type === 'rampart' && 'user' in obj && obj.user !== creep.user) return;
        }
      }
      
      const movePower = calcMovePower(creep);
      pending.set(creep._id, { x: newX, y: newY, creep, movePower });
    },
    
    resolve(gameTime: number): Map<string, { x: number; y: number }> {
      const result = new Map<string, { x: number; y: number }>();
      const processed = new Set<string>();
      
      // Alternate player priority based on tick parity for fairness
      const player1First = (gameTime % 2 === 0);
      
      // First pass: detect and handle swaps
      // A swap occurs when creep A wants to move to creep B's position,
      // and creep B wants to move to creep A's position
      // Sort IDs for deterministic swap detection order
      const sortedIds = Array.from(pending.keys()).sort();
      for (const idA of sortedIds) {
        if (processed.has(idA)) continue;
        const moveA = pending.get(idA)!;
        
        // Find if there's an occupant at target position who wants to move to our position
        for (const idB of sortedIds) {
          if (idA === idB || processed.has(idB)) continue;
          const moveB = pending.get(idB)!;
          
          const creepA = moveA.creep;
          const creepB = moveB.creep;
          
          // Check if this is a swap: A->B's pos and B->A's pos
          const aToB = moveA.x === creepB.x && moveA.y === creepB.y;
          const bToA = moveB.x === creepA.x && moveB.y === creepA.y;
          
          if (aToB && bToA) {
            // This is a swap! Both creeps can move
            result.set(idA, { x: moveA.x, y: moveA.y });
            result.set(idB, { x: moveB.x, y: moveB.y });
            processed.add(idA);
            processed.add(idB);
            break;
          }
        }
      }
      
      // Second pass: group remaining moves by target position
      const byPosition = new Map<string, PendingMove[]>();
      for (const id of sortedIds) {
        if (processed.has(id)) continue;
        const move = pending.get(id)!;
        
        const key = `${move.x},${move.y}`;
        const list = byPosition.get(key) || [];
        list.push(move);
        byPosition.set(key, list);
      }
      
      // Resolve conflicts - sort position keys for deterministic order
      const sortedPositions = Array.from(byPosition.keys()).sort();
      for (const posKey of sortedPositions) {
        const moves = byPosition.get(posKey)!;
        const [x, y] = posKey.split(',').map(Number);
        
        // Check if target is occupied by a non-moving creep (and not involved in a swap)
        let blocked = false;
        for (const obj of roomObjects.values()) {
          if (obj.x === x && obj.y === y && obj.type === 'creep') {
            const occupant = obj as RuntimeCreep;
            // Blocked if occupant isn't moving, or if occupant already processed (swapped away)
            if (!pending.has(occupant._id) && !result.has(occupant._id)) {
              blocked = true;
              break;
            }
            // Also blocked if occupant is moving but to a different position (not swapping with us)
            const occupantMove = pending.get(occupant._id);
            if (occupantMove && !processed.has(occupant._id)) {
              // Check if occupant is moving away from this position
              const movingAway = occupantMove.x !== x || occupantMove.y !== y;
              if (!movingAway) {
                // Occupant is staying put (failed move) - we're blocked
                blocked = true;
                break;
              }
            }
          }
        }
        
        if (blocked) continue;
        
        if (moves.length === 1) {
          // Single creep moving to position
          result.set(moves[0].creep._id, { x, y });
        } else {
          // Multiple creeps competing for same position
          // Sort by: 1) move power (descending), 2) player priority (alternates by tick), 3) ID
          moves.sort((a, b) => {
            if (b.movePower !== a.movePower) {
              return b.movePower - a.movePower; // Higher move power wins
            }
            // Player-fair tiebreaker: alternate priority based on tick
            const userA = a.creep.user ?? '';
            const userB = b.creep.user ?? '';
            if (userA !== userB) {
              const cmp = userA.localeCompare(userB);
              return player1First ? cmp : -cmp; // Alternate who wins ties
            }
            return a.creep._id.localeCompare(b.creep._id); // Same player: use ID
          });
          
          // Winner is the creep with highest priority
          result.set(moves[0].creep._id, { x, y });
        }
      }
      
      return result;
    }
  };
}

/**
 * Process creep move intent (register for collision resolution)
 */
export function processMove(
  creep: RuntimeCreep,
  intent: ObjectIntents['move'],
  scope: MoveScope,
  registry: MovementRegistry
): void {
  if (!intent?.direction) return;
  if (creep.spawning) return;
  
  // Store old fatigue for movement calculations
  creep._oldFatigue = creep.fatigue;
  
  // Can't move with fatigue
  if (creep.fatigue > 0) return;
  
  // Check for MOVE body parts
  const hasMoves = creep.body.some(part => part.hits > 0 && part.type === C.MOVE);
  if (!hasMoves && !creep._pulled) return;
  
  const [dx, dy] = getOffsetsByDirection(intent.direction);
  registry.addMove(creep, dx, dy);
  
  creep._move = { direction: intent.direction };
}

/**
 * Apply resolved movements
 */
export function applyMovements(
  movements: Map<string, { x: number; y: number }>,
  roomObjects: Map<string, RuntimeObject>,
  terrain: TerrainData,
  bulk: { update(obj: RuntimeObject, updates: Partial<RuntimeObject>): void }
): void {
  for (const [id, pos] of movements) {
    const obj = roomObjects.get(id);
    if (!obj || obj.type !== 'creep') continue;
    
    const creep = obj as RuntimeCreep;
    
    // Calculate fatigue
    let fatigueRate = 2; // Plain
    if (terrain.data[pos.y * terrain.width + pos.x] === C.TERRAIN_SWAMP) {
      fatigueRate = 10;
    }
    
    // Check for road
    for (const roadObj of roomObjects.values()) {
      if (roadObj.type === 'road' && roadObj.x === pos.x && roadObj.y === pos.y) {
        fatigueRate = 1;
        break;
      }
    }
    
    // Calculate weight
    let weight = 0;
    let carryCapacity = 0;
    for (const part of creep.body) {
      if (part.type !== C.MOVE && part.type !== C.CARRY) {
        weight++;
      }
      if (part.type === C.CARRY && part.hits > 0) {
        carryCapacity += C.CARRY_CAPACITY;
      }
    }
    
    // Add resource weight
    const store = creep.store as unknown as Record<string, number>;
    let carried = 0;
    for (const key in store) {
      if (typeof store[key] === 'number') {
        carried += store[key];
      }
    }
    
    // Each CARRY's worth of resources adds 1 weight
    const resourceWeight = Math.ceil(carried / C.CARRY_CAPACITY);
    weight += resourceWeight;
    
    const fatigue = weight * fatigueRate;
    
    // Update position
    bulk.update(creep, { x: pos.x, y: pos.y, fatigue: (creep.fatigue || 0) + fatigue } as Partial<RuntimeObject>);
  }
}

// Extend type for movement tracking
declare module '../../../driver/types.js' {
  interface RuntimeCreep {
    _oldFatigue?: number;
    _move?: { direction: DirectionConstant };
    _pulled?: boolean;
  }
}

