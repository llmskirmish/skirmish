/**
 * MatchRunner - Screeps Arena compatible persistent script runner
 * 
 * Uses Node's vm module to create a separate JS context per player.
 * Executes the shared sandbox runtime code, then the player's script.
 * 
 * NOTE: Node vm is NOT a security boundary. Use IsolatedRunner with
 * isolated-vm in production for untrusted code execution.
 */

import * as vm from 'node:vm';
import { BaseRunner, type TickInput, type ScriptResult } from './BaseRunner.js';
import { sandboxRuntimeCode } from './sandbox-runtime.bundle.js';

/**
 * Arena-compatible persistent runner with state preservation across ticks
 */
export class MatchRunner extends BaseRunner {
  private context: vm.Context;
  private script: vm.Script | null = null;
  private loopFn: (() => void) | null = null;
  private scriptSource: string;
  private tickStartTime: number = 0;
  
  // Pre-compiled scripts for tick execution
  private refreshScript: vm.Script | null = null;

  constructor(playerId: string, script: string) {
    super(playerId);
    this.scriptSource = script;
    
    // Create isolated VM context for this player
    this.context = this.createContext();
    
    // Run the shared sandbox runtime
    this.runSandboxRuntime();
    
    // Compile and run the player script
    this.initializeScript();
  }

  /**
   * Create the VM context with callback bindings
   */
  private createContext(): vm.Context {
    const self = this;
    
    const sandbox = {
      // Set the player ID
      _playerId: this.playerId,
      
      // Direct callback functions (vm context can use direct calls)
      _getObjectsDirect: () => self.serializeObjects(),
      _getTicksDirect: () => self.currentTick,
      _getTerrainAtDirect: (x: number, y: number) => self.getTerrainAt(x, y),
      _addIntentDirect: (objectId: string, type: string, data: string) => 
        self.addIntent(objectId, type, JSON.parse(data)),
      _consoleLogDirect: (msg: string) => self.consoleOutput.push(msg),
      _generateIdDirect: () => self.currentGenerateId(),
      
      // Performance timing
      getCpuTime: () => performance.now() - self.tickStartTime,
    };
    
    return vm.createContext(sandbox);
  }

  /**
   * Run the shared sandbox runtime code
   */
  private runSandboxRuntime(): void {
    try {
      const runtimeScript = new vm.Script(sandboxRuntimeCode, {
        filename: 'sandbox-runtime.js'
      });
      runtimeScript.runInContext(this.context);
      
      // Pre-compile the refresh script
      this.refreshScript = new vm.Script('_refreshTick(_terrainData, _tickNumber)');
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      console.error(`[${this.playerId}] Sandbox runtime error:`, error);
    }
  }

  /**
   * Initialize the player script
   */
  private initializeScript(): void {
    if (this.initError) return; // Skip if runtime failed
    
    try {
      // Compile and run the player script to define functions/globals
      this.script = new vm.Script(this.scriptSource, {
        filename: `player_${this.playerId}.js`
      });
      
      this.script.runInContext(this.context);
      
      // Get reference to loop function if defined
      if (typeof this.context.loop === 'function') {
        this.loopFn = this.context.loop as () => void;
      }
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      console.error(`[${this.playerId}] Script initialization error:`, error);
    }
  }

  /**
   * Run a single tick
   */
  runTick(input: TickInput): ScriptResult {
    const startTime = performance.now();
    this.tickStartTime = startTime;
    
    // Update state
    this.updateTickState(input);
    this.resetTickState();
    
    try {
      // Pass terrain data and tick to the sandbox
      if (this.currentTerrain) {
        this.context._terrainData = Array.from(this.currentTerrain);
      }
      this.context._tickNumber = this.currentTick;
      
      // Refresh the object cache
      if (this.refreshScript) {
        this.refreshScript.runInContext(this.context);
      }
      
      // Call the loop function
      if (this.loopFn) {
        this.loopFn();
      }
      
      const cpuUsed = performance.now() - startTime;
      
      return {
        intents: this.intents,
        console: this.consoleOutput,
        cpuUsed
      };
    } catch (error) {
      const cpuUsed = performance.now() - startTime;
      
      return {
        intents: this.intents,
        console: this.consoleOutput,
        error: error instanceof Error ? error.message : String(error),
        cpuUsed
      };
    }
  }

  /**
   * Destroy this runner and clean up resources
   */
  destroy(): void {
    this.script = null;
    this.loopFn = null;
    this.refreshScript = null;
    // Note: vm.Context cannot be explicitly destroyed in Node,
    // it will be garbage collected when no references remain
  }
}

// Re-export types for convenience
export type { TickInput, ScriptResult } from './BaseRunner.js';
