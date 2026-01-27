/**
 * The Swarm - Aggressive melee rush strategy
 * 
 * Strategy: Spawn cheap, fast melee units and rush the enemy.
 * Always be moving, always be attacking. Overwhelm with numbers.
 */

function loop() {
  const myCreeps = getObjectsByPrototype(Creep).filter(c => c.my && !c.spawning);
  const enemies = getObjectsByPrototype(Creep).filter(c => !c.my && !c.spawning);
  const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
  const enemySpawn = getObjectsByPrototype(StructureSpawn).find(s => !s.my);

  // Run each creep
  for (const creep of myCreeps) {
    runCreep(creep, enemies, enemySpawn, mySpawn);
  }

  // Spawn new creeps
  if (mySpawn && !mySpawn.spawning) {
    // Cheap and fast melee attackers
    mySpawn.spawnCreep([ATTACK, ATTACK, MOVE, MOVE]);
  }
}

function runCreep(creep, enemies, enemySpawn, mySpawn) {
  // Check body parts: creep.body is an array of {type, hits} objects
  const isMelee = creep.body.some(p => p.type === ATTACK);
  if (!isMelee) return; // Skip non-combat creeps (e.g., workers)

  // Priority 1: Attack adjacent enemies
  const adjacentEnemy = findClosestByRange(creep, enemies.filter(e => getRange(creep, e) <= 1));
  if (adjacentEnemy) {
    creep.attack(adjacentEnemy);
    // Stay on them if they're still alive
    creep.moveTo(adjacentEnemy);
    return;
  }

  // Priority 2: Attack enemy spawn if in range
  if (enemySpawn && getRange(creep, enemySpawn) <= 1) {
    creep.attack(enemySpawn);
    return;
  }

  // Priority 3: Find and chase the nearest enemy
  const nearestEnemy = findClosestByRange(creep, enemies);
  if (nearestEnemy) {
    creep.moveTo(nearestEnemy);
    return;
  }

  // Priority 4: Attack the enemy spawn
  if (enemySpawn) {
    creep.moveTo(enemySpawn);
    return;
  }

  // Fallback: Patrol around our spawn (should rarely happen)
  if (mySpawn) {
    const tick = getTicks();
    const angle = (tick / 20 + creep.id.charCodeAt(0)) % (2 * Math.PI);
    creep.moveTo({
      x: Math.round(mySpawn.x + Math.cos(angle) * 5),
      y: Math.round(mySpawn.y + Math.sin(angle) * 5)
    });
  }
}
