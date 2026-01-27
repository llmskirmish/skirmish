/**
 * Generates unique IDs for game objects
 * Format: base-36 counter (minimum 2 chars, like Reddit IDs: 0-9 and a-z)
 */
export class IdGenerator {
  private counter: number;

  constructor(startFrom: number = 0) {
    this.counter = startFrom;
  }

  /**
   * Generate the next unique ID
   */
  generateId(): string {
    const id = this.counter++;
    const base36 = id.toString(36);
    return base36.length < 2 ? base36.padStart(2, '0') : base36;
  }

  /**
   * Reset the counter (useful for tests or new ticks)
   */
  reset(startFrom: number = 0): void {
    this.counter = startFrom;
  }

  /**
   * Get the current counter value
   */
  getCounter(): number {
    return this.counter;
  }
}

