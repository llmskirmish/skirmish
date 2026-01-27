/**
 * Seeded random number generator using Mulberry32 algorithm.
 * This provides deterministic random numbers for reproducible game simulations.
 * 
 * Mulberry32 is a simple 32-bit generator with good statistical properties
 * and is fast enough for game use.
 */
export class SeededRandom {
  private state: number;

  /**
   * Create a new seeded random generator.
   * @param seed - Initial seed value. If not provided, uses a default seed.
   */
  constructor(seed: number = 1) {
    // Ensure seed is a 32-bit integer
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1; // Avoid zero state
    }
  }

  /**
   * Generate the next random number in [0, 1)
   * Uses the Mulberry32 algorithm.
   */
  random(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Generate a random integer in [min, max] (inclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Generate a random hex string of specified length
   */
  randomHex(length: number = 4): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(this.random() * 16).toString(16);
    }
    return result;
  }

  /**
   * Get the current state (for serialization/debugging)
   */
  getState(): number {
    return this.state;
  }

  /**
   * Set the state (for deserialization)
   */
  setState(state: number): void {
    this.state = state >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  /**
   * Create a child generator with a derived seed.
   * Useful for creating independent random streams.
   */
  fork(): SeededRandom {
    return new SeededRandom(this.randomInt(1, 0x7FFFFFFF));
  }
}

