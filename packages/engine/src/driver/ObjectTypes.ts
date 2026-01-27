/**
 * Object type constants for game objects.
 * Note: Object IDs are now simple base-36 counters (e.g., "00", "0a", "1z").
 * Type is determined by the object's `type` property, not the ID.
 */
export const ObjectTypes = {
  /** Creep units */
  CREEP: 'crp',
  /** Spawn structures */
  SPAWN: 'spn',
  /** Tower structures */
  TOWER: 'twr',
  /** Generic structure (built from construction site) */
  STRUCTURE: 'str',
  /** Extension structures */
  EXTENSION: 'ext',
  /** Container structures */
  CONTAINER: 'cnt',
  /** Road structures */
  ROAD: 'rds',
  /** Wall structures */
  WALL: 'wal',
  /** Rampart structures */
  RAMPART: 'ram',
  /** Construction site */
  CONSTRUCTION_SITE: 'cst',
  /** Dropped resource */
  RESOURCE: 'res',
  /** Energy source */
  SOURCE: 'src',
  /** Generic object (fallback) */
  OBJECT: 'obj',
} as const;

export type ObjectTypeCode = typeof ObjectTypes[keyof typeof ObjectTypes];
