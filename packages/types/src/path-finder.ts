import type { Position } from './prototypes/position.js';
import { DEFAULT_MAP_SIZE } from '@skirmish/maps';

/**
 * Search path options
 */
export interface SearchPathOptions {
  /** Custom navigation cost data */
  costMatrix?: CostMatrix;

  /** Cost for walking on plain positions. The default is 2 */
  plainCost?: number;

  /** Cost for walking on swamp positions. The default is 10 */
  swampCost?: number;

  /** Instead of searching for a path to the goals this will search for a path away from the goals */
  flee?: boolean;

  /** The maximum allowed pathfinding operations. The default value is 50000 */
  maxOps?: number;

  /** The maximum allowed cost of the path returned. The default is Infinity */
  maxCost?: number;

  /** Weight from 1 to 9 to apply to the heuristic in the A* formula F = G + weight * H */
  heuristicWeight?: number;
}

/**
 * Search path result
 */
export interface SearchPathResult {
  /** The path found as an array of objects containing x and y properties */
  path: Position[];

  /** Total number of operations performed before this path was calculated */
  ops: number;

  /** The total cost of the path as derived from plainCost, swampCost, and given CostMatrix instance */
  cost: number;

  /** If the pathfinder fails to find a complete path, this will be true */
  incomplete: boolean;
}

/**
 * Container for custom navigation cost data.
 * If a non-0 value is found in the CostMatrix then that value will be used instead of the default terrain cost.
 */
export class CostMatrix {
  private _bits: Uint8Array;
  private static readonly SIZE = DEFAULT_MAP_SIZE; // 100x100 arena

  constructor() {
    this._bits = new Uint8Array(CostMatrix.SIZE * CostMatrix.SIZE);
  }

  /**
   * Get the cost of a position in this CostMatrix
   */
  get(x: number, y: number): number {
    return this._bits[x * CostMatrix.SIZE + y];
  }

  /**
   * Set the cost of a position in this CostMatrix
   */
  set(x: number, y: number, cost: number): void {
    this._bits[x * CostMatrix.SIZE + y] = Math.min(255, Math.max(0, cost));
  }

  /**
   * Returns a new CostMatrix instance
   */
  clone(): CostMatrix {
    const clone = new CostMatrix();
    clone._bits = new Uint8Array(this._bits);
    return clone;
  }

  /**
   * Serialize the CostMatrix to an array for storage
   */
  serialize(): number[] {
    return Array.from(new Uint32Array(this._bits.buffer));
  }

  /**
   * Create a CostMatrix from serialized data
   */
  static deserialize(data: number[]): CostMatrix {
    const matrix = new CostMatrix();
    matrix._bits = new Uint8Array(new Uint32Array(data).buffer);
    return matrix;
  }
}

/**
 * Goal type for pathfinding
 */
export type Goal = Position | { pos: Position; range: number };

// Priority queue for A* algorithm
class MinHeap {
  private heap: { index: number; priority: number }[] = [];
  private indices: Map<number, number> = new Map();

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(index: number, priority: number): void {
    const node = { index, priority };
    this.heap.push(node);
    this.indices.set(index, this.heap.length - 1);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { index: number; priority: number } | undefined {
    if (this.heap.length === 0) return undefined;
    
    const result = this.heap[0];
    const last = this.heap.pop()!;
    this.indices.delete(result.index);
    
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indices.set(last.index, 0);
      this.bubbleDown(0);
    }
    
    return result;
  }

  has(index: number): boolean {
    return this.indices.has(index);
  }

  updatePriority(index: number, priority: number): void {
    const heapIndex = this.indices.get(index);
    if (heapIndex === undefined) return;
    
    const oldPriority = this.heap[heapIndex].priority;
    this.heap[heapIndex].priority = priority;
    
    if (priority < oldPriority) {
      this.bubbleUp(heapIndex);
    } else {
      this.bubbleDown(heapIndex);
    }
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < this.heap.length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      if (rightChild < this.heap.length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }

      if (smallest === index) break;
      
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
    this.indices.set(this.heap[i].index, i);
    this.indices.set(this.heap[j].index, j);
  }
}

// Terrain types
const TERRAIN_PLAIN = 0;
const TERRAIN_WALL = 1;
const TERRAIN_SWAMP = 2;

// Global terrain data (set by runtime)
let globalTerrain: Uint8Array | null = null;
let globalArenaWidth = DEFAULT_MAP_SIZE;
let globalArenaHeight = DEFAULT_MAP_SIZE;

/**
 * Set the terrain data for pathfinding
 */
export function setTerrain(terrain: Uint8Array, size = DEFAULT_MAP_SIZE): void {
  globalTerrain = terrain;
  globalArenaWidth = size;
  globalArenaHeight = size;
}

/**
 * Get terrain at position
 */
function getTerrainAt(x: number, y: number): number {
  if (!globalTerrain) return TERRAIN_PLAIN;
  if (x < 0 || x >= globalArenaWidth || y < 0 || y >= globalArenaHeight) return TERRAIN_WALL;
  return globalTerrain[y * globalArenaWidth + x] || TERRAIN_PLAIN;
}

/**
 * Find an optimal path between origin and goal using A* algorithm.
 */
export function searchPath(
  origin: Position,
  goal: Goal | Goal[],
  options: SearchPathOptions = {}
): SearchPathResult {
  const {
    costMatrix,
    plainCost = 2,
    swampCost = 10,
    flee = false,
    maxOps = 50000,
    maxCost = Infinity,
    heuristicWeight = 1.2,
  } = options;

  // Normalize goals
  const goals: Array<{ pos: Position; range: number }> = (Array.isArray(goal) ? goal : [goal]).map(g => {
    if ('pos' in g) {
      return { pos: g.pos, range: g.range };
    }
    return { pos: g, range: 0 };
  });

  if (goals.length === 0) {
    return { path: [], ops: 0, cost: 0, incomplete: false };
  }

  const width = globalArenaWidth;
  const height = globalArenaHeight;
  
  const posToIndex = (x: number, y: number) => y * width + x;
  const indexToPos = (index: number): Position => ({ x: index % width, y: Math.floor(index / width) });

  // Heuristic: Chebyshev distance to nearest goal
  const heuristic = (x: number, y: number): number => {
    let minDist = Infinity;
    for (const g of goals) {
      const dist = Math.max(Math.abs(x - g.pos.x), Math.abs(y - g.pos.y));
      if (flee) {
        // For fleeing, we want to maximize distance
        minDist = Math.min(minDist, -dist);
      } else {
        minDist = Math.min(minDist, Math.max(0, dist - g.range));
      }
    }
    return minDist * heuristicWeight;
  };

  // Check if position is at goal
  const isAtGoal = (x: number, y: number): boolean => {
    for (const g of goals) {
      const dist = Math.max(Math.abs(x - g.pos.x), Math.abs(y - g.pos.y));
      if (dist <= g.range) return true;
    }
    return false;
  };

  // Get movement cost for a position
  const getMoveCost = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 255;
    
    // Check cost matrix first
    if (costMatrix) {
      const cost = costMatrix.get(x, y);
      if (cost > 0) return cost === 255 ? 255 : cost;
    }
    
    const terrain = getTerrainAt(x, y);
    switch (terrain) {
      case TERRAIN_WALL: return 255;
      case TERRAIN_SWAMP: return swampCost;
      default: return plainCost;
    }
  };

  // Direction offsets (8 directions)
  const directions = [
    { dx: 0, dy: -1 },  // TOP
    { dx: 1, dy: -1 },  // TOP_RIGHT
    { dx: 1, dy: 0 },   // RIGHT
    { dx: 1, dy: 1 },   // BOTTOM_RIGHT
    { dx: 0, dy: 1 },   // BOTTOM
    { dx: -1, dy: 1 },  // BOTTOM_LEFT
    { dx: -1, dy: 0 },  // LEFT
    { dx: -1, dy: -1 }, // TOP_LEFT
  ];

  const openSet = new MinHeap();
  const closedSet = new Set<number>();
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();

  const startIndex = posToIndex(origin.x, origin.y);
  gScore.set(startIndex, 0);
  openSet.push(startIndex, heuristic(origin.x, origin.y));

  let ops = 0;
  let finalIndex = -1;
  let finalCost = 0;

  while (!openSet.isEmpty() && ops < maxOps) {
    ops++;
    
    const current = openSet.pop()!;
    const currentPos = indexToPos(current.index);
    const currentG = gScore.get(current.index) || 0;

    // Check if we reached goal
    if (isAtGoal(currentPos.x, currentPos.y)) {
      finalIndex = current.index;
      finalCost = currentG;
      break;
    }

    closedSet.add(current.index);

    // Explore neighbors
    for (const dir of directions) {
      const nx = currentPos.x + dir.dx;
      const ny = currentPos.y + dir.dy;
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const neighborIndex = posToIndex(nx, ny);
      if (closedSet.has(neighborIndex)) continue;

      const moveCost = getMoveCost(nx, ny);
      if (moveCost >= 255) continue; // Impassable

      const tentativeG = currentG + moveCost;
      if (tentativeG > maxCost) continue;

      const existingG = gScore.get(neighborIndex);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScore.set(neighborIndex, tentativeG);
      cameFrom.set(neighborIndex, current.index);

      const fScore = tentativeG + heuristic(nx, ny);
      
      if (openSet.has(neighborIndex)) {
        openSet.updatePriority(neighborIndex, fScore);
      } else {
        openSet.push(neighborIndex, fScore);
      }
    }
  }

  // Reconstruct path
  const path: Position[] = [];
  if (finalIndex !== -1) {
    let current = finalIndex;
    while (current !== startIndex) {
      path.push(indexToPos(current));
      const prev = cameFrom.get(current);
      if (prev === undefined) break;
      current = prev;
    }
    path.reverse();
  }

  return {
    path,
    ops,
    cost: finalCost,
    incomplete: finalIndex === -1,
  };
}
