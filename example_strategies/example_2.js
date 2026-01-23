/**
 * The Rangers - Kiting ranged attackers
 * 
 * Strategy: Keep distance from enemies, attack from range.
 * Kite backwards when enemies get close, always maintain range 3.
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
    // Ranged attackers with good mobility
    mySpawn.spawnCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE]);
  }
}

function runCreep(creep, enemies, enemySpawn, mySpawn) {
  const nearestEnemy = findClosestByRange(creep, enemies);
  const enemyRange = nearestEnemy ? getRange(creep, nearestEnemy) : Infinity;

  // Priority 1: Attack enemies in range (range 3 for ranged attack)
  if (nearestEnemy && enemyRange <= 3) {
    creep.rangedAttack(nearestEnemy);
    
    // Kite: If enemy is too close (range 2 or less), back away
    if (enemyRange <= 2) {
      moveAway(creep, nearestEnemy);
      return;
    }
    
    // At perfect range (3), hold position or find more targets
    return;
  }

  // Priority 2: Attack enemy spawn if in range
  if (enemySpawn && getRange(creep, enemySpawn) <= 3) {
    creep.rangedAttack(enemySpawn);
    // Back off if enemies are nearby
    if (nearestEnemy && enemyRange <= 4) {
      moveAway(creep, nearestEnemy);
    }
    return;
  }

  // Priority 3: Approach nearest enemy to get in range
  if (nearestEnemy) {
    creep.moveTo(nearestEnemy);
    return;
  }

  // Priority 4: Attack the enemy spawn
  if (enemySpawn) {
    creep.moveTo(enemySpawn);
    return;
  }

  // Fallback: Patrol around our spawn
  if (mySpawn) {
    const tick = getTicks();
    const angle = (tick / 20 + creep.id.charCodeAt(0)) % (2 * Math.PI);
    creep.moveTo({
      x: Math.round(mySpawn.x + Math.cos(angle) * 5),
      y: Math.round(mySpawn.y + Math.sin(angle) * 5)
    });
  }
}

function moveAway(creep, target) {
  // Move in the opposite direction from the target
  const dx = creep.x - target.x;
  const dy = creep.y - target.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  
  creep.moveTo({
    x: Math.round(creep.x + (dx / dist) * 3),
    y: Math.round(creep.y + (dy / dist) * 3)
  });
}
