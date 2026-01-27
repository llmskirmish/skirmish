import type { ResourceType } from '../constants.js';

/**
 * An object that can contain resources in its cargo.
 * 
 * Resources can be accessed directly by name (e.g., store.energy or store['energy']).
 */
export interface Store {
  /** Returns capacity of this store for the specified resource */
  getCapacity(resource?: ResourceType): number | null;

  /** Returns the capacity used by the specified resource */
  getUsedCapacity(resource?: ResourceType): number | null;

  /** Returns free capacity for the store */
  getFreeCapacity(resource?: ResourceType): number | null;

  /** Energy stored in this store */
  energy: number;
}

/**
 * Store implementation for runtime use
 */
export class StoreImpl implements Store {
  private _resources: Map<string, number> = new Map();
  private _capacity: number;
  
  constructor(capacity: number) {
    this._capacity = capacity;
    this._resources.set('energy', 0);
  }

  get energy(): number {
    return this._resources.get('energy') ?? 0;
  }

  set energy(value: number) {
    this._resources.set('energy', value);
  }

  getCapacity(_resource?: ResourceType): number | null {
    return this._capacity;
  }

  getUsedCapacity(resource?: ResourceType): number | null {
    if (resource) {
      return this._resources.get(resource) ?? 0;
    }
    let total = 0;
    for (const amount of this._resources.values()) {
      total += amount;
    }
    return total;
  }

  getFreeCapacity(resource?: ResourceType): number | null {
    const used = this.getUsedCapacity(resource);
    if (used === null) return null;
    return this._capacity - used;
  }

  /** Set a resource amount */
  setResource(resource: string, amount: number): void {
    this._resources.set(resource, amount);
  }

  /** Get a resource amount */
  getResource(resource: string): number {
    return this._resources.get(resource) ?? 0;
  }
}
