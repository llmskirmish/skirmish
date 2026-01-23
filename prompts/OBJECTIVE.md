# Skirmish — Game Objective

 Skirmish is a game where players write JavaScript game scripts that battle in real-time strategy combat. The game uses the **Screeps Arena API**, a programmable RTS engine where code controls every action.

## Victory Condition

**Destroy your opponent's Spawn to win.**

Each player starts with one Spawn structure. When a Spawn is destroyed, that player loses. If neither Spawn is destroyed when the tick limit is reached, the match ends in a draw.

---

## Core Mechanics

### The Arena

- **100×100 tile grid** with three terrain types:
  - **Plain** — Normal movement
  - **Swamp** — Slows movement (increased fatigue)
  - **Wall** — Impassable

### Spawns

Your Spawn is your base and your only way to create units:

- **5,000 HP** on the swamp map (can vary by map)
- **Stores energy** — Used to spawn creeps (starts with 500 on swamp map)
- **Spawning takes time** — 3 ticks per body part (a 3-part creep takes 9 ticks)
- `spawn.spawning` is truthy while spawning, `null` when ready
- `spawn.store.energy` shows current energy

### Creeps

Creeps are the units you control. Each creep is built from **body parts** that determine its abilities:

| Body Part | Cost | Function |
|-----------|------|----------|
| `MOVE` | 50 | Reduces fatigue, enables movement |
| `ATTACK` | 80 | Melee attack (30 damage, range 1) |
| `RANGED_ATTACK` | 150 | Ranged attack (10 damage, range 1-3) |
| `HEAL` | 250 | Heals self or allies (12 HP close, 4 HP ranged) |
| `WORK` | 100 | Harvests energy from sources |
| `CARRY` | 50 | Carries resources (50 capacity) |
| `TOUGH` | 10 | Cheap HP buffer (100 HP) |

**Fatigue System:** Moving generates fatigue based on body weight and terrain:
- Each non-MOVE, non-CARRY part adds **2 fatigue** on plains, **10 fatigue** on swamps
- Each MOVE part reduces fatigue by **2 per tick**
- Creeps cannot move while `fatigue > 0`
- **Full speed on plains:** 1 MOVE per 1 heavy part (e.g., `[ATTACK, MOVE]`)
- **Full speed on swamps:** 5 MOVE per 1 heavy part (expensive!)

### Energy & Economy

Some maps contain **Sources** — harvestable energy deposits:
- Creeps with `WORK` parts can harvest energy
- Energy is carried with `CARRY` parts and deposited into the Spawn
- More energy = more creeps = stronger army

Maps without sources start with finite spawn energy, rewarding aggressive early plays.

---

## Combat

### Attack Types

- **Melee (`attack`)** — 30 damage at range 1
- **Ranged (`rangedAttack`)** — 10 damage at range 1-3
- **Mass Attack (`rangedMassAttack`)** — Damages all enemies within range 3 (damage scales with distance)

### Healing

- **Close heal** — 12 HP at range 1
- **Ranged heal** — 4 HP at range 1-3

### Damage Resolution

All attacks and heals are processed simultaneously each tick. Body parts are destroyed as they take damage (100 HP per part). Creeps die when all body parts are destroyed.

---

## Writing a Game Script

Write your game script in **`strategies/{model_name}/round_1.js`**

Your game script is a JavaScript file with a `loop()` function that runs every tick:

```javascript
function loop() {
  // Get all game objects
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
  const enemySpawn = getObjectsByPrototype(StructureSpawn).find(s => !s.my);
  const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);

  // Command your creeps
  for (const creep of myCreeps) {
    if (enemySpawn) {
      creep.moveTo(enemySpawn);
      creep.attack(enemySpawn);
    }
  }

  // Spawn new creeps
  if (mySpawn && !mySpawn.spawning) {
    mySpawn.spawnCreep([ATTACK, MOVE, MOVE]);
  }
}
```

### Example Scripts

For complete working examples, see:
- **`example_strategies/example_1.js`** — Aggressive melee rush strategy using cheap, fast attackers
- **`example_strategies/example_2.js`** — Kiting ranged strategy that maintains distance and attacks from range

### Key API Functions

| Function | Description |
|----------|-------------|
| `getObjectsByPrototype(Type)` | Get all objects of a type (Creep, StructureSpawn, Source, etc.) |
| `getRange(a, b)` | Chebyshev distance between two positions |
| `findClosestByRange(obj, targets)` | Find nearest target by range |
| `findClosestByPath(obj, targets, opts)` | Find nearest reachable target |
| `findInRange(obj, targets, range)` | Find all targets within range |
| `getTerrainAt(pos)` | Get terrain type at position (TERRAIN_PLAIN, TERRAIN_SWAMP, TERRAIN_WALL) |
| `getDirection(dx, dy)` | Convert delta to direction constant (TOP, RIGHT, etc.) |
| `getTicks()` | Get current tick number |
| `getObjectById(id)` | Get a game object by its ID |
| `searchPath(origin, goal, opts)` | Advanced pathfinding with CostMatrix support |

### GameObject Methods

All game objects (creeps, spawns, sources) have these instance methods:

| Method | Description |
|--------|-------------|
| `obj.getRangeTo(target)` | Distance to target (same as `getRange(obj, target)`) |
| `obj.findInRange(objects, range)` | Find objects within range of this object |
| `obj.findClosestByRange(objects)` | Find closest object to this object |
| `obj.findClosestByPath(objects, opts)` | Find closest reachable object |
| `obj.findPathTo(target, opts)` | Get path array to target |

### Creep Actions

| Method | Range | Description |
|--------|-------|-------------|
| `move(direction)` | — | Move one tile in a direction |
| `moveTo(target, opts)` | — | Pathfind and move toward target |
| `attack(target)` | 1 | Melee attack (30 damage) |
| `rangedAttack(target)` | 1-3 | Ranged attack (10 damage) |
| `rangedMassAttack()` | 1-3 | AoE attack (10/4/1 damage at range 1/2/3) |
| `heal(target)` | 1 | Close heal (12 HP) |
| `rangedHeal(target)` | 1-3 | Ranged heal (4 HP) |
| `harvest(source)` | 1 | Gather energy (2 per WORK part) |
| `transfer(target, type)` | 1 | Give resources to structure/creep |
| `pull(target)` | 1 | Drag another creep when you move |
| `drop(type, amount)` | — | Drop resources on the ground |
| `pickup(resource)` | 1 | Pick up dropped resources |

### CostMatrix

Custom pathfinding costs for `moveTo()` and `searchPath()`:

```javascript
const cm = new CostMatrix();

// Set terrain costs (0 = use default, 255 = unwalkable)
cm.set(x, y, 5);      // Avoid this tile (higher = less preferred)
cm.set(x, y, 255);    // Block this tile completely

// Use in pathfinding
creep.moveTo(target, { costMatrix: cm });
```

---

## Starting Conditions

Each player starts with:

- **1 Spawn** (5,000 HP, 500 energy)
- **3 Workers** — `[MOVE, MOVE, CARRY, CARRY, WORK, WORK]`
- **1 Melee** — `[ATTACK, ATTACK, MOVE, MOVE, TOUGH]`

The map has **4 Sources** (3,000 energy each) for harvesting.

---

## Constants

These constants are available globally in your game script:

```javascript
// Body parts
MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, TOUGH

// Terrain
TERRAIN_PLAIN  // 0
TERRAIN_WALL   // 1
TERRAIN_SWAMP  // 2

// Directions
TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT

// Resources
RESOURCE_ENERGY

// Prototypes (for getObjectsByPrototype)
Creep, StructureSpawn, Source
```

---

## Match Flow

1. Both players start with a Spawn and starting units (varies by map)
2. Each tick, both `loop()` functions execute simultaneously
3. All intents (move, attack, spawn, etc.) are collected and processed
4. Game state updates; damaged units lose HP, new creeps spawn
5. Repeat until a Spawn dies or tick limit is reached

**Default tick limit:** 2000 ticks

---