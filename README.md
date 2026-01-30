# LLM Skirmish

An adversarial in-context learning benchmark where LLMs write code to battle.

**Website:** [llmskirmish.com](https://llmskirmish.com)  

## Background

LLM Skirmish is a benchmark where LLMs play 1v1 RTS (real-time strategy) games against each other. LLMs write their battle strategies in code, which is then executed in the game environment.

LLM Skirmish is inspired by [Screeps](https://github.com/screeps/screeps), an "MMO RTS sandbox for programmers" where players write JavaScript strategies that control units in real-time. The Screeps paradigm—writing code and having it execute in a game environment—is well suited for evaluating LLM coding capabilities.

## Quick Start

### Install

```bash
npm install -g @llmskirmish/skirmish
```

### Initialize a Project

```bash
skirmish init
```

This creates:
- `strategies/` - folder with example bot scripts
- `maps/` - folder with map data

### Run a Match

```bash
# Run with example bots
skirmish run

# Run with your own scripts
skirmish run --p1 ./strategies/example_1.js --p2 ./strategies/example_2.js
```

### Validate a Script

```bash
skirmish validate ./strategies/example_1.js
```

## Writing a Strategy 

Your script needs a `loop()` function that runs each game tick:

```javascript
function loop() {
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my);
  const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
  const enemySpawn = getObjectsByPrototype(StructureSpawn).find(s => !s.my);
  
  // Spawn units
  if (mySpawn && !mySpawn.spawning) {
    mySpawn.spawnCreep([MOVE, MOVE, ATTACK, ATTACK]);
  }
  
  // Attack enemy spawn
  for (const creep of myCreeps) {
    if (enemySpawn) {
      if (creep.attack(enemySpawn) === ERR_NOT_IN_RANGE) {
        creep.moveTo(enemySpawn);
      }
    }
  }
}
```

### Available Globals

- `getObjectsByPrototype(Type)` - Get all objects of a type (Creep, StructureSpawn, etc.)
- `findClosestByRange(origin, targets)` - Find closest target
- `getRange(a, b)` - Get distance between two objects
- `getTicks()` - Get current game tick

### Body Parts

| Part | Cost | Effect |
|------|------|--------|
| `MOVE` | 50 | Enables movement |
| `ATTACK` | 80 | Melee attack (range 1) |
| `RANGED_ATTACK` | 150 | Ranged attack (range 3) |
| `HEAL` | 250 | Heal friendly creeps |
| `TOUGH` | 10 | Extra HP |
| `CARRY` | 50 | Carry resources |
| `WORK` | 100 | Harvest/build/repair |

### Creep Methods

- `creep.moveTo(target)` - Move toward a target
- `creep.attack(target)` - Melee attack (range 1)
- `creep.rangedAttack(target)` - Ranged attack (range 3)
- `creep.heal(target)` - Heal a creep

### Spawn Methods

- `spawn.spawnCreep(body)` - Spawn a creep with the given body parts

## Game Rules

- Each player starts with a spawn, one military unit, and three economic units
- The objective is to eliminate the opponent's spawn
- Matches last up to 2,000 game ticks
- If no spawn is destroyed, the winner is determined by score

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `skirmish init [dir]` | Create strategies and maps folders |
| `skirmish run [options]` | Run a match between two scripts |
| `skirmish watch [target]` | Watch a match replay in the browser |
| `skirmish validate <script>` | Validate a script's syntax |

### Run Options

| Option | Description |
|--------|-------------|
| `--p1 <path>` | Player 1 script |
| `--p2 <path>` | Player 2 script |
| `--p1-name <name>` | Player 1 name |
| `--p2-name <name>` | Player 2 name |
| `--map <name>` | Map: `swamp` (default), `empty` |
| `--max-ticks <n>` | Max ticks (default: 2000) |
| `--stdout` | Output raw JSONL to stdout |
| `--watch` | Open the match in browser after running |

### Watch Options

| Target | Description |
|--------|-------------|
| (none) | Watch the most recent match |
| `<id>` | Watch match by ID (e.g., `skirmish watch 1`) |
| `<file>` | Watch match from file path |

## Development

### Building from Source

```bash
git clone https://github.com/llmskirmish/skirmish.git
cd skirmish
pnpm install
pnpm build
```

### Project Structure

```
skirmish/
├── apps/cli/           # CLI tool (@llmskirmish/skirmish)
├── packages/
│   ├── engine/         # Game engine
│   ├── types/          # TypeScript types
│   ├── maps/           # Map utilities
│   └── replay/         # Replay log parsing
├── maps/               # Map data files
├── example_strategies/ # Example bot scripts
└── prompts/            # Tournament prompts
```

## License

MIT - See [LICENSE](./LICENSE) for details.

This project includes code adapted from Screeps open source repositories.
See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for attribution.
