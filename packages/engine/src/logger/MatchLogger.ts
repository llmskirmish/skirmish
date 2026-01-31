/**
 * MatchLogger - Generate LLM-readable text logs of match states
 * 
 * Designed for easy navigation with prominent tick markers and motion tracking.
 */

import type { Replay, TickSnapshot } from '../match/MatchManager.js';
import type { MatchConfig, RuntimeObject, RuntimeCreep, RuntimeSpawn, RuntimeTower, RuntimeSource } from '../driver/types.js';
import type { ResultObject } from '../processor/ArenaProcessor.js';

/**
 * Direction constants to names
 */
const DIRECTION_NAMES: Record<number, string> = {
  1: 'TOP',
  2: 'TOP_RIGHT',
  3: 'RIGHT',
  4: 'BOTTOM_RIGHT',
  5: 'BOTTOM',
  6: 'BOTTOM_LEFT',
  7: 'LEFT',
  8: 'TOP_LEFT'
};

/**
 * Log generation options
 */
export interface MatchLoggerOptions {
  /** Map name to include in header */
  mapName?: string;
  /** Include full object details (body parts, etc) */
  verbose?: boolean;
}

/**
 * MatchLogger generates text logs from match replays
 */
export class MatchLogger {
  private options: MatchLoggerOptions;

  constructor(options: MatchLoggerOptions = {}) {
    this.options = options;
  }

  /**
   * Generate complete log from replay data with run-length compression
   */
  generateLog(replay: Replay, seed: number): string {
    const lines: string[] = [];

    // Add header
    lines.push(this.formatHeader(replay.config, seed));

    // Track previous tick's objects for motion detection
    let prevObjects: Map<string, ResultObject> = new Map();

    // First pass: generate tick data with pattern signatures for compression
    interface TickData {
      tick: number;
      output: string;
      patternSignature: string;  // For detecting repeated patterns
      objects: Map<string, ResultObject>;
    }
    const tickDataList: TickData[] = [];

    for (const tickSnapshot of replay.ticks) {
      const currentObjects = new Map<string, ResultObject>();
      for (const obj of tickSnapshot.objects) {
        currentObjects.set(obj._id, obj);
      }

      const output = this.formatTick(tickSnapshot, prevObjects, currentObjects);
      const patternSignature = this.getTickPatternSignature(tickSnapshot, prevObjects, currentObjects);
      
      tickDataList.push({
        tick: tickSnapshot.tick,
        output,
        patternSignature,
        objects: currentObjects
      });
      
      prevObjects = currentObjects;
    }

    // Second pass: compress consecutive identical patterns and skip empty ticks
    let i = 0;
    while (i < tickDataList.length) {
      const current = tickDataList[i];
      
      // Tick 0 always outputs fully
      if (current.tick === 0) {
        lines.push(current.output);
        i++;
        continue;
      }

      // Skip empty ticks (no actions, no state changes)
      if (current.output === '') {
        i++;
        continue;
      }

      // Look for consecutive ticks with identical patterns
      let runLength = 1;
      while (i + runLength < tickDataList.length) {
        const next = tickDataList[i + runLength];
        if (next.patternSignature === current.patternSignature && next.patternSignature !== '') {
          runLength++;
        } else {
          break;
        }
      }

      // If we have a run of 3+ identical ticks, compress them
      if (runLength >= 3 && current.patternSignature !== '') {
        const startTick = current.tick;
        const endTick = tickDataList[i + runLength - 1].tick;
        const startObjects = i > 0 ? tickDataList[i - 1].objects : new Map<string, ResultObject>();
        const endObjects = tickDataList[i + runLength - 1].objects;
        
        lines.push(this.formatCompressedTicks(startTick, endTick, runLength, current.patternSignature, startObjects, endObjects));
        i += runLength;
      } else {
        lines.push(current.output);
        i++;
      }
    }

    // Add victory result if present
    if (replay.victory) {
      lines.push(this.formatVictory(replay.victory));
    }

    return lines.join('\n');
  }

  /**
   * Generate a pattern signature for a tick (used for run-length compression)
   * Returns empty string if tick shouldn't be compressed
   */
  private getTickPatternSignature(
    snapshot: TickSnapshot,
    prevObjects: Map<string, ResultObject>,
    currentObjects: Map<string, ResultObject>
  ): string {
    // Don't compress tick 0
    if (snapshot.tick === 0) return '';

    // Build a signature from the actions (without specific HP values)
    const actionParts: string[] = [];
    
    for (const obj of snapshot.objects) {
      const actionLog = (obj as unknown as RuntimeCreep).actionLog;
      if (actionLog) {
        // Capture the pattern of what's attacking/healing what
        if (actionLog.attack) {
          const target = this.findObjectAtPosition(currentObjects, actionLog.attack.x, actionLog.attack.y) 
                      || this.findObjectAtPosition(prevObjects, actionLog.attack.x, actionLog.attack.y);
          actionParts.push(`${obj._id}:atk:${target?._id || 'pos'}`);
        }
        if (actionLog.rangedAttack) {
          const target = this.findObjectAtPosition(currentObjects, actionLog.rangedAttack.x, actionLog.rangedAttack.y)
                      || this.findObjectAtPosition(prevObjects, actionLog.rangedAttack.x, actionLog.rangedAttack.y);
          actionParts.push(`${obj._id}:ratk:${target?._id || 'pos'}`);
        }
        if (actionLog.heal) {
          const target = this.findObjectAtPosition(currentObjects, actionLog.heal.x, actionLog.heal.y);
          actionParts.push(`${obj._id}:heal:${target?._id || 'pos'}`);
        }
        if (actionLog.rangedHeal) {
          const target = this.findObjectAtPosition(currentObjects, actionLog.rangedHeal.x, actionLog.rangedHeal.y);
          actionParts.push(`${obj._id}:rheal:${target?._id || 'pos'}`);
        }
        if (actionLog.harvest) {
          const target = this.findObjectAtPosition(currentObjects, actionLog.harvest.x, actionLog.harvest.y);
          actionParts.push(`${obj._id}:harvest:${target?._id || 'pos'}`);
        }
        // Don't include movement in signature (moves change each tick typically)
      }
    }

    // Check for movement - if there's any movement, don't compress
    for (const [, obj] of currentObjects) {
      const prevObj = prevObjects.get(obj._id);
      if (prevObj && (prevObj.x !== obj.x || prevObj.y !== obj.y)) {
        return ''; // Has movement, don't compress
      }
    }

    // Check for destroyed objects - don't compress ticks with destruction
    for (const [id] of prevObjects) {
      if (!currentObjects.has(id)) {
        return ''; // Has destruction, don't compress
      }
    }

    // Check for new objects
    for (const [id] of currentObjects) {
      if (!prevObjects.has(id)) {
        return ''; // Has new objects, don't compress
      }
    }

    // Return sorted signature
    return actionParts.sort().join('|');
  }

  /**
   * Format a compressed range of identical ticks
   */
  private formatCompressedTicks(
    startTick: number,
    endTick: number,
    count: number,
    _patternSignature: string,
    startObjects: Map<string, ResultObject>,
    endObjects: Map<string, ResultObject>
  ): string {
    const lines: string[] = [];
    const startStr = startTick.toString().padStart(4, ' ');
    const endStr = endTick.toString().padStart(4, ' ');
    
    lines.push(`==[ TICKS ${startStr}-${endStr} (${count} ticks) ]${'='.repeat(52)}`);
    lines.push('');
    lines.push('REPEATED:');
    
    // Show what changed over the entire range
    const changes: string[] = [];
    
    for (const [id, endObj] of endObjects) {
      const startObj = startObjects.get(id);
      if (!startObj) continue;
      
      // Check HP change
      const startHits = (startObj as unknown as { hits?: number }).hits;
      const endHits = (endObj as unknown as { hits?: number }).hits;
      if (startHits !== undefined && endHits !== undefined && startHits !== endHits) {
        const diff = endHits - startHits;
        const sign = diff > 0 ? '+' : '';
        changes.push(`  ${this.formatObjectId(endObj)}: hp ${startHits} -> ${endHits} (${sign}${diff})`);
      }
      
      // Check energy change
      const startEnergy = (startObj as unknown as { store?: { energy?: number } }).store?.energy || 0;
      const endEnergy = (endObj as unknown as { store?: { energy?: number } }).store?.energy || 0;
      if (startEnergy !== endEnergy) {
        const diff = endEnergy - startEnergy;
        const sign = diff > 0 ? '+' : '';
        changes.push(`  ${this.formatObjectId(endObj)}: energy ${startEnergy} -> ${endEnergy} (${sign}${diff})`);
      }
      
      // Check source energy
      if (endObj.type === 'source') {
        const startSrcEnergy = (startObj as unknown as RuntimeSource).energy;
        const endSrcEnergy = (endObj as unknown as RuntimeSource).energy;
        if (startSrcEnergy !== endSrcEnergy) {
          const diff = endSrcEnergy - startSrcEnergy;
          const sign = diff > 0 ? '+' : '';
          changes.push(`  ${this.formatObjectId(endObj)}: energy ${startSrcEnergy} -> ${endSrcEnergy} (${sign}${diff})`);
        }
      }
    }
    
    if (changes.length > 0) {
      for (const change of changes) {
        lines.push(change);
      }
    } else {
      lines.push('  (no state changes)');
    }
    
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate log header with match configuration
   */
  formatHeader(config: MatchConfig, seed: number): string {
    const divider = '='.repeat(80);
    const lines: string[] = [
      divider,
      'SKIRMISH MATCH LOG',
      divider,
      `Map: ${this.options.mapName || 'unknown'}`,
      `Seed: ${seed}`,
      `Arena: ${config.arenaWidth}x${config.arenaHeight}`,
      `Max Ticks: ${config.maxTicks}`,
      ''
    ];

    for (const player of config.players) {
      lines.push(`${this.formatPlayerId(player.id)}: ${player.name}`);
    }

    lines.push('');
    lines.push(divider);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format player ID (e.g., "player1" -> "PLAYER 1")
   */
  private formatPlayerId(playerId: string): string {
    const match = playerId.match(/^player(\d+)$/);
    if (match) {
      return `PLAYER ${match[1]}`;
    }
    return playerId.toUpperCase();
  }

  /**
   * Format a single tick snapshot
   */
  formatTick(
    snapshot: TickSnapshot,
    prevObjects: Map<string, ResultObject>,
    currentObjects: Map<string, ResultObject>
  ): string {
    // Special handling for tick 0
    if (snapshot.tick === 0) {
      return this.formatTick0(snapshot);
    }

    const lines: string[] = [];
    const tickNum = snapshot.tick.toString().padStart(4, ' ');

    // Prominent tick marker
    lines.push(`==[ TICK ${tickNum} ]${'='.repeat(66)}`);
    lines.push('');

    // Actions section - detect what happened this tick
    const actions = this.detectActions(prevObjects, currentObjects, snapshot);
    if (actions.length > 0) {
      lines.push('ACTIONS:');
      for (const action of actions) {
        lines.push(`  ${action}`);
      }
      lines.push('');
    }

    // Helper to check if an object has meaningful state changes this tick
    // (excludes movement and actions which are already shown in ACTIONS section)
    const hasStateChange = (obj: ResultObject): boolean => {
      const prevObj = prevObjects.get(obj._id);
      
      // New object
      if (!prevObj) return true;
      
      // HP changed
      const prevHits = (prevObj as unknown as { hits?: number }).hits;
      const currHits = (obj as unknown as { hits?: number }).hits;
      if (prevHits !== undefined && currHits !== undefined && prevHits !== currHits) return true;
      
      // Store/energy changed
      const prevStore = (prevObj as unknown as { store?: { energy?: number } }).store;
      const currStore = (obj as unknown as { store?: { energy?: number } }).store;
      if (prevStore?.energy !== currStore?.energy) return true;
      
      // For sources, check energy directly
      if (obj.type === 'source') {
        const prevEnergy = (prevObj as unknown as RuntimeSource).energy;
        const currEnergy = (obj as unknown as RuntimeSource).energy;
        if (prevEnergy !== currEnergy) return true;
      }
      
      // Spawning status changed (for creeps)
      if (obj.type === 'creep') {
        const prevCreep = prevObj as unknown as RuntimeCreep;
        const currCreep = obj as unknown as RuntimeCreep;
        if (prevCreep.spawning !== currCreep.spawning) return true;
      }
      
      // Spawning activity changed (for spawns)
      if (obj.type === 'spawn') {
        const prevSpawn = prevObj as unknown as RuntimeSpawn;
        const currSpawn = obj as unknown as RuntimeSpawn;
        const prevSpawning = prevSpawn.spawning?.creep;
        const currSpawning = currSpawn.spawning?.creep;
        if (prevSpawning !== currSpawning) return true;
        // Also show if spawning progress changed
        if (prevSpawn.spawning && currSpawn.spawning) {
          if (prevSpawn.spawning.remainingTime !== currSpawn.spawning.remainingTime) return true;
        }
      }
      
      return false;
    };

    // Group objects by owner, collecting only those with meaningful state changes
    const player1Changed: ResultObject[] = [];
    const player2Changed: ResultObject[] = [];
    const neutralChanged: ResultObject[] = [];

    for (const obj of snapshot.objects) {
      const changed = hasStateChange(obj);
      if (obj.user === 'player1') {
        if (changed) player1Changed.push(obj);
      } else if (obj.user === 'player2') {
        if (changed) player2Changed.push(obj);
      } else {
        if (changed) neutralChanged.push(obj);
      }
    }

    // Sort each group by type then id
    const sortByTypeAndId = (a: ResultObject, b: ResultObject) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a._id.localeCompare(b._id);
    };
    player1Changed.sort(sortByTypeAndId);
    player2Changed.sort(sortByTypeAndId);
    neutralChanged.sort(sortByTypeAndId);

    // Check if all objects are unchanged
    const allUnchanged = player1Changed.length === 0 && player2Changed.length === 0 && neutralChanged.length === 0;
    
    // If no actions AND no state changes, skip this tick entirely
    if (actions.length === 0 && allUnchanged) {
      return ''; // Empty string signals tick should be skipped
    }

    // Only show object state sections if there are changes
    if (!allUnchanged) {
      // Player 1 Objects
      if (player1Changed.length > 0) {
        lines.push(`PLAYER 1:`);
        for (const obj of player1Changed) {
          const prevObj = prevObjects.get(obj._id);
          const isNew = !prevObj;
          lines.push(`  ${this.formatObject(obj, prevObj, isNew)}`);
        }
        lines.push('');
      }

      // Player 2 Objects
      if (player2Changed.length > 0) {
        lines.push(`PLAYER 2:`);
        for (const obj of player2Changed) {
          const prevObj = prevObjects.get(obj._id);
          const isNew = !prevObj;
          lines.push(`  ${this.formatObject(obj, prevObj, isNew)}`);
        }
        lines.push('');
      }

      // Neutral Objects (sources, etc)
      if (neutralChanged.length > 0) {
        lines.push(`NEUTRAL:`);
        for (const obj of neutralChanged) {
          const prevObj = prevObjects.get(obj._id);
          const isNew = !prevObj;
          lines.push(`  ${this.formatObject(obj, prevObj, isNew)}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format tick 0 as initial state - combines spawns and creeps with body info
   */
  private formatTick0(snapshot: TickSnapshot): string {
    const lines: string[] = [];

    lines.push(`==[ TICK    0 ]==================================================================`);
    lines.push('');

    // Group objects by owner
    const player1Objects: ResultObject[] = [];
    const player2Objects: ResultObject[] = [];
    const neutralObjects: ResultObject[] = [];

    for (const obj of snapshot.objects) {
      if (obj.user === 'player1') {
        player1Objects.push(obj);
      } else if (obj.user === 'player2') {
        player2Objects.push(obj);
      } else {
        neutralObjects.push(obj);
      }
    }

    // Sort: spawns first, then creeps by id
    const sortForInitial = (a: ResultObject, b: ResultObject) => {
      const typeOrder: Record<string, number> = { spawn: 0, creep: 1, source: 2, tower: 3 };
      const aOrder = typeOrder[a.type] ?? 99;
      const bOrder = typeOrder[b.type] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a._id.localeCompare(b._id);
    };

    player1Objects.sort(sortForInitial);
    player2Objects.sort(sortForInitial);
    neutralObjects.sort(sortForInitial);

    // Format player sections
    if (player1Objects.length > 0) {
      lines.push('PLAYER 1:');
      for (const obj of player1Objects) {
        lines.push(`  ${this.formatInitialObject(obj)}`);
      }
      lines.push('');
    }

    if (player2Objects.length > 0) {
      lines.push('PLAYER 2:');
      for (const obj of player2Objects) {
        lines.push(`  ${this.formatInitialObject(obj)}`);
      }
      lines.push('');
    }

    if (neutralObjects.length > 0) {
      lines.push('NEUTRAL:');
      for (const obj of neutralObjects) {
        lines.push(`  ${this.formatInitialObject(obj)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format an object for the initial state display (tick 0)
   */
  private formatInitialObject(obj: ResultObject): string {
    const parts: string[] = [];
    
    // Type(id) @ position
    parts.push(`${this.formatObjectId(obj)} @ (${obj.x},${obj.y})`);

    switch (obj.type) {
      case 'creep': {
        const creep = obj as unknown as RuntimeCreep;
        parts.push(`hp:${creep.hits}`);
        // Include body parts for initial state
        if (creep.body) {
          const bodyStr = creep.body.map(p => p.type).join(',');
          parts.push(`body:[${bodyStr}]`);
        }
        break;
      }
      case 'spawn': {
        const spawn = obj as unknown as RuntimeSpawn;
        parts.push(`hp:${spawn.hits}`);
        parts.push(`energy:${spawn.store?.energy || 0}`);
        break;
      }
      case 'source': {
        const source = obj as unknown as RuntimeSource;
        parts.push(`energy:${source.energy}/${source.energyCapacity}`);
        break;
      }
      case 'tower': {
        const tower = obj as unknown as RuntimeTower;
        parts.push(`hp:${tower.hits}`);
        parts.push(`energy:${tower.store?.energy || 0}`);
        break;
      }
    }

    return parts.join(' ');
  }

  /**
   * Format object ID as Type(id)
   * e.g., id "0a" with type "creep" -> "Creep(0a)"
   */
  formatObjectId(obj: ResultObject): string {
    const typeName = obj.type.charAt(0).toUpperCase() + obj.type.slice(1);
    const playerPrefix = obj.user === 'player1' ? "P1's " : obj.user === 'player2' ? "P2's " : '';
    return `${playerPrefix}${typeName}(${obj._id})`;
  }

  /**
   * Format a single object's state (position shown only, movement is in ACTIONS)
   */
  formatObject(obj: ResultObject, prevObj?: ResultObject, isNew?: boolean): string {
    const parts: string[] = [];

    // Type(id) format
    parts.push(this.formatObjectId(obj));

    // Position (no prev tracking - movement is in ACTIONS section)
    parts.push(`@ (${obj.x},${obj.y})`);

    // Type-specific details
    switch (obj.type) {
      case 'creep':
        this.formatCreepDetails(obj as unknown as RuntimeCreep, prevObj as unknown as RuntimeCreep | undefined, parts);
        break;
      case 'spawn':
        this.formatSpawnDetails(obj as unknown as RuntimeSpawn, parts);
        break;
      case 'tower':
        this.formatTowerDetails(obj as unknown as RuntimeTower, parts);
        break;
      case 'source':
        this.formatSourceDetails(obj as unknown as RuntimeSource, parts);
        break;
    }

    return parts.join(' ');
  }

  /**
   * Format creep-specific details (actions are shown in ACTIONS section, not here)
   */
  private formatCreepDetails(creep: RuntimeCreep, prevCreep: RuntimeCreep | undefined, parts: string[]): void {
    // Health with change indicator
    if (prevCreep && prevCreep.hits !== creep.hits) {
      const diff = creep.hits - prevCreep.hits;
      const sign = diff > 0 ? '+' : '';
      parts.push(`hp:${creep.hits}(${sign}${diff})`);
    } else {
      parts.push(`hp:${creep.hits}`);
    }

    // Spawning state
    if (creep.spawning) {
      parts.push('spawning');
    }

    // Store if has energy
    const energy = creep.store?.energy || 0;
    if (energy > 0) {
      parts.push(`energy:${energy}`);
    }
    // Note: Action tags removed - they're already shown in ACTIONS section
  }

  /**
   * Format spawn-specific details
   */
  private formatSpawnDetails(spawn: RuntimeSpawn, parts: string[]): void {
    parts.push(`hp:${spawn.hits}`);
    parts.push(`energy:${spawn.store?.energy || 0}`);

    if (spawn.spawning) {
      parts.push(`spawning:Creep(${spawn.spawning.creep})(${spawn.spawning.remainingTime}/${spawn.spawning.needTime})`);
    }
  }

  /**
   * Format tower-specific details
   */
  private formatTowerDetails(tower: RuntimeTower, parts: string[]): void {
    parts.push(`hp:${tower.hits}`);
    parts.push(`energy:${tower.store?.energy || 0}`);
    if (tower.cooldown > 0) {
      parts.push(`cooldown:${tower.cooldown}`);
    }
  }

  /**
   * Format source-specific details
   */
  private formatSourceDetails(source: RuntimeSource, parts: string[]): void {
    parts.push(`energy:${source.energy}/${source.energyCapacity}`);
  }

  /**
   * Find object at a given position
   */
  private findObjectAtPosition(objects: Map<string, ResultObject>, x: number, y: number): ResultObject | undefined {
    for (const obj of objects.values()) {
      if (obj.x === x && obj.y === y) return obj;
    }
    return undefined;
  }

  /**
   * Calculate damage dealt to a target by comparing HP
   */
  private calculateDamage(prevObjects: Map<string, ResultObject>, currentObjects: Map<string, ResultObject>, targetId: string): number | undefined {
    const prevTarget = prevObjects.get(targetId) as unknown as { hits?: number } | undefined;
    const currTarget = currentObjects.get(targetId) as unknown as { hits?: number } | undefined;
    
    if (prevTarget?.hits !== undefined && currTarget?.hits !== undefined) {
      const diff = prevTarget.hits - currTarget.hits;
      if (diff > 0) return diff;
    }
    
    // If target was destroyed, check prev HP
    if (prevTarget?.hits !== undefined && !currTarget) {
      return prevTarget.hits;
    }
    
    return undefined;
  }

  /**
   * Detect actions that occurred this tick by comparing objects
   */
  private detectActions(
    prevObjects: Map<string, ResultObject>,
    currentObjects: Map<string, ResultObject>,
    snapshot: TickSnapshot
  ): string[] {
    const actions: string[] = [];

    // Check for movements
    for (const [, obj] of currentObjects) {
      const prevObj = prevObjects.get(obj._id);
      if (prevObj && (prevObj.x !== obj.x || prevObj.y !== obj.y)) {
        const dx = obj.x - prevObj.x;
        const dy = obj.y - prevObj.y;
        const dir = this.getDirectionName(dx, dy);
        actions.push(`${this.formatObjectId(obj)}: move ${dir} (${prevObj.x},${prevObj.y}) -> (${obj.x},${obj.y})`);
      }
    }

    // Check for new objects (directly created creeps - not spawned from spawn)
    for (const [, obj] of currentObjects) {
      if (!prevObjects.has(obj._id)) {
        if (obj.type === 'creep') {
          const creep = obj as unknown as RuntimeCreep;
          // Only log if not spawning (spawning creeps are logged when they finish)
          if (!creep.spawning) {
            const bodyStr = this.formatBodyParts(creep.body);
            actions.push(`${this.formatObjectId(obj)}: created at (${obj.x},${obj.y}) ${bodyStr}`);
          }
        }
      }
    }

    // Check for creeps that finished spawning
    for (const [, obj] of currentObjects) {
      if (obj.type !== 'creep') continue;
      const creep = obj as unknown as RuntimeCreep;
      const prevCreep = prevObjects.get(obj._id) as unknown as RuntimeCreep | undefined;
      if (prevCreep?.spawning && !creep.spawning) {
        const bodyStr = this.formatBodyParts(creep.body);
        actions.push(`${this.formatObjectId(obj)}: spawned ${bodyStr}`);
      }
    }

    // Collect body part activation/deactivation (we'll combine with damage lines below)
    const disabledByTarget = new Map<string, string[]>();
    const enabledByTarget = new Map<string, string[]>();
    
    for (const [, obj] of currentObjects) {
      if (obj.type !== 'creep') continue;
      const creep = obj as unknown as RuntimeCreep;
      const prevCreep = prevObjects.get(obj._id) as unknown as RuntimeCreep | undefined;
      if (!prevCreep) continue;

      const deactivated: string[] = [];
      const activated: string[] = [];

      for (let i = 0; i < creep.body.length; i++) {
        const currPart = creep.body[i];
        const prevPart = prevCreep.body[i];
        if (!prevPart) continue;

        // Body part deactivated (was active, now inactive)
        if (prevPart.hits > 0 && currPart.hits <= 0) {
          deactivated.push(currPart.type);
        }
        // Body part activated (was inactive, now active - e.g., from healing)
        if (prevPart.hits <= 0 && currPart.hits > 0) {
          activated.push(currPart.type);
        }
      }

      if (deactivated.length > 0) {
        disabledByTarget.set(obj._id, deactivated);
      }
      if (activated.length > 0) {
        enabledByTarget.set(obj._id, activated);
      }
    }

    // Track destroyed objects (we'll combine with attacker info below)
    const destroyedIds = new Set<string>();
    for (const [id] of prevObjects) {
      if (!currentObjects.has(id)) {
        destroyedIds.add(id);
      }
    }

    // Collect combat actions grouped by target for accurate damage/heal reporting
    const attacksByTarget = new Map<string, { target: ResultObject | undefined; targetKey: string; attackers: string[] }>();
    const healsByTarget = new Map<string, { target: ResultObject | undefined; targetKey: string; healers: string[] }>();

    for (const obj of snapshot.objects) {
      const actionLog = (obj as unknown as RuntimeCreep).actionLog;
      if (!actionLog) continue;

      // Collect attacks
      if (actionLog.attack) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.attack.x, actionLog.attack.y) 
                    || this.findObjectAtPosition(prevObjects, actionLog.attack.x, actionLog.attack.y);
        const targetKey = target ? target._id : `pos:${actionLog.attack.x},${actionLog.attack.y}`;
        if (!attacksByTarget.has(targetKey)) {
          attacksByTarget.set(targetKey, { target, targetKey, attackers: [] });
        }
        attacksByTarget.get(targetKey)!.attackers.push(this.formatObjectId(obj));
      }
      if (actionLog.rangedAttack) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.rangedAttack.x, actionLog.rangedAttack.y)
                    || this.findObjectAtPosition(prevObjects, actionLog.rangedAttack.x, actionLog.rangedAttack.y);
        const targetKey = target ? target._id : `pos:${actionLog.rangedAttack.x},${actionLog.rangedAttack.y}`;
        if (!attacksByTarget.has(targetKey)) {
          attacksByTarget.set(targetKey, { target, targetKey, attackers: [] });
        }
        attacksByTarget.get(targetKey)!.attackers.push(`${this.formatObjectId(obj)}(ranged)`);
      }
      if (actionLog.rangedMassAttack) {
        actions.push(`${this.formatObjectId(obj)}: rangedMassAttack`);
      }

      // Collect heals
      if (actionLog.heal) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.heal.x, actionLog.heal.y);
        const targetKey = target ? target._id : `pos:${actionLog.heal.x},${actionLog.heal.y}`;
        if (!healsByTarget.has(targetKey)) {
          healsByTarget.set(targetKey, { target, targetKey, healers: [] });
        }
        healsByTarget.get(targetKey)!.healers.push(this.formatObjectId(obj));
      }
      if (actionLog.rangedHeal) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.rangedHeal.x, actionLog.rangedHeal.y);
        const targetKey = target ? target._id : `pos:${actionLog.rangedHeal.x},${actionLog.rangedHeal.y}`;
        if (!healsByTarget.has(targetKey)) {
          healsByTarget.set(targetKey, { target, targetKey, healers: [] });
        }
        healsByTarget.get(targetKey)!.healers.push(`${this.formatObjectId(obj)}(ranged)`);
      }

      // Other actions (not grouped)
      if (actionLog.harvest) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.harvest.x, actionLog.harvest.y);
        const targetStr = target ? this.formatObjectId(target) : `(${actionLog.harvest.x},${actionLog.harvest.y})`;
        actions.push(`${this.formatObjectId(obj)}: harvest -> ${targetStr}`);
      }
      if (actionLog.build) {
        const target = this.findObjectAtPosition(currentObjects, actionLog.build.x, actionLog.build.y);
        const targetStr = target ? this.formatObjectId(target) : `(${actionLog.build.x},${actionLog.build.y})`;
        actions.push(`${this.formatObjectId(obj)}: build -> ${targetStr}`);
      }
    }

    // Output per-target damage summaries (or "destroyed by" if target was destroyed)
    // Also combine with disabled body parts
    const attackedDestroyedIds = new Set<string>();
    const disabledCombinedIds = new Set<string>();
    
    for (const [, { target, targetKey, attackers }] of attacksByTarget) {
      const targetStr = target ? this.formatObjectId(target) : `(${targetKey.replace('pos:', '')})`;
      const attackerStr = attackers.length === 1 ? `by ${attackers[0]}` : `by ${attackers.join(', ')}`;
      
      // Check for disabled body parts to combine
      const disabled = target ? disabledByTarget.get(target._id) : undefined;
      const disabledStr = disabled ? `, disabled: ${disabled.join(', ')}` : '';
      if (disabled) disabledCombinedIds.add(target!._id);
      
      // Check if this target was destroyed
      if (target && destroyedIds.has(target._id)) {
        attackedDestroyedIds.add(target._id);
        actions.push(`${targetStr}: destroyed ${attackerStr}`);
      } else {
        const damage = target ? this.calculateDamage(prevObjects, currentObjects, target._id) : undefined;
        const damageStr = damage !== undefined ? ` took ${damage} damage` : '';
        actions.push(`${targetStr}:${damageStr} ${attackerStr}${disabledStr}`);
      }
    }
    
    // Output any destroyed objects that weren't attacked (e.g., TTL expiry)
    for (const id of destroyedIds) {
      if (!attackedDestroyedIds.has(id)) {
        const obj = prevObjects.get(id);
        if (obj) {
          actions.push(`${this.formatObjectId(obj)}: destroyed`);
        }
      }
    }

    // Output per-target heal summaries (combine with enabled body parts)
    const enabledCombinedIds = new Set<string>();
    
    for (const [, { target, targetKey, healers }] of healsByTarget) {
      const targetStr = target ? this.formatObjectId(target) : `(${targetKey.replace('pos:', '')})`;
      const prevTarget = target ? prevObjects.get(target._id) as unknown as { hits?: number } | undefined : undefined;
      const currTarget = target as unknown as { hits?: number } | undefined;
      const healed = (prevTarget?.hits !== undefined && currTarget?.hits !== undefined) 
                   ? currTarget.hits - prevTarget.hits : undefined;
      const healStr = healed !== undefined && healed > 0 ? ` healed ${healed}` : '';
      const healerStr = healers.length === 1 ? `by ${healers[0]}` : `by ${healers.join(', ')}`;
      
      // Check for enabled body parts to combine
      const enabled = target ? enabledByTarget.get(target._id) : undefined;
      const enabledStr = enabled ? `, enabled: ${enabled.join(', ')}` : '';
      if (enabled) enabledCombinedIds.add(target!._id);
      
      actions.push(`${targetStr}:${healStr} ${healerStr}${enabledStr}`);
    }
    
    // Output any disabled/enabled that weren't combined with damage/heal
    for (const [id, parts] of disabledByTarget) {
      if (!disabledCombinedIds.has(id)) {
        const obj = currentObjects.get(id);
        if (obj) {
          actions.push(`${this.formatObjectId(obj)}: disabled: ${parts.join(', ')}`);
        }
      }
    }
    for (const [id, parts] of enabledByTarget) {
      if (!enabledCombinedIds.has(id)) {
        const obj = currentObjects.get(id);
        if (obj) {
          actions.push(`${this.formatObjectId(obj)}: enabled: ${parts.join(', ')}`);
        }
      }
    }

    // Check spawns for spawning activity
    for (const obj of snapshot.objects) {
      if (obj.type === 'spawn') {
        const spawn = obj as unknown as RuntimeSpawn;
        const prevSpawn = prevObjects.get(obj._id) as unknown as RuntimeSpawn | undefined;
        
        // Detect new spawn started
        if (spawn.spawning && (!prevSpawn?.spawning || prevSpawn.spawning.creep !== spawn.spawning.creep)) {
          actions.push(`${this.formatObjectId(obj)}: spawnCreep -> Creep(${spawn.spawning.creep})`);
        }
      }
    }

    return actions;
  }

  /**
   * Format body parts, hiding disabled parts (hits <= 0)
   * e.g., body:[attack,attack,move,move] (omits disabled parts)
   */
  private formatBodyParts(body: RuntimeCreep['body']): string {
    const activeParts = body.filter(p => p.hits > 0).map(p => p.type);
    return `body:[${activeParts.join(',')}]`;
  }

  /**
   * Get direction name from dx/dy
   */
  private getDirectionName(dx: number, dy: number): string {
    if (dx === 0 && dy < 0) return 'TOP';
    if (dx > 0 && dy < 0) return 'TOP_RIGHT';
    if (dx > 0 && dy === 0) return 'RIGHT';
    if (dx > 0 && dy > 0) return 'BOTTOM_RIGHT';
    if (dx === 0 && dy > 0) return 'BOTTOM';
    if (dx < 0 && dy > 0) return 'BOTTOM_LEFT';
    if (dx < 0 && dy === 0) return 'LEFT';
    if (dx < 0 && dy < 0) return 'TOP_LEFT';
    return 'NONE';
  }

  /**
   * Format victory result
   */
  private formatVictory(victory: { winner: string | null; reason: string; scores: Record<string, number> }): string {
    const lines: string[] = [
      '='.repeat(80),
      'MATCH RESULT',
      '='.repeat(80),
      '',
      `Winner: ${victory.winner ? this.formatPlayerId(victory.winner) : 'DRAW'}`,
      `Reason: ${victory.reason}`,
      '',
      'Scores:'
    ];

    for (const [playerId, score] of Object.entries(victory.scores)) {
      lines.push(`  ${this.formatPlayerId(playerId)}: ${score}`);
    }

    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}

