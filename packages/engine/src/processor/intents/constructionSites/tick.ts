import { C } from '@skirmish/types';
import type { RuntimeObject, RuntimeConstructionSite, BulkOperation, GameEvent } from '../../../driver/types.js';

export interface ConstructionSiteTickScope {
  roomObjects: Map<string, RuntimeObject>;
  bulk: BulkOperation;
  events: GameEvent[];
}

/**
 * Process construction site tick
 * 
 * Construction sites decay over time if not worked on.
 */
export function processConstructionSiteTick(
  site: RuntimeConstructionSite,
  scope: ConstructionSiteTickScope
): void {
  if (site.type !== 'constructionSite') return;

  const { bulk, events } = scope;

  // Decrement ticks to decay
  if (site.ticksToDecay !== undefined) {
    site.ticksToDecay--;
    
    if (site.ticksToDecay <= 0) {
      // Remove the construction site
      bulk.remove(site._id);
      scope.roomObjects.delete(site._id);

      events.push({
        type: C.EVENT_DESTROY,
        objectId: site._id,
        data: { reason: 'decay' }
      });
    } else {
      bulk.update(site, { ticksToDecay: site.ticksToDecay });
    }
  }
}

