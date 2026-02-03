/**
 * ELO Rating System
 * 
 * Shared rating calculation logic for the ladder system.
 * Used by matchmaker, ladder API, and dev server.
 */

// ============================================
// CONFIGURATION
// ============================================

/** Initial ELO for new scripts */
export const INITIAL_ELO = 1500;

/** ELO K-factor for rating calculations */
export const K_FACTOR = 32;

// ============================================
// ELO CALCULATION
// ============================================

/**
 * Calculate expected score for player A against player B
 * 
 * @param ratingA - Player A's current rating
 * @param ratingB - Player B's current rating
 * @returns Expected score between 0 and 1
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Update ELO ratings for two players after a match
 * 
 * @param ratings - Map of script ID to current rating
 * @param scriptA - First script (p1) ID
 * @param scriptB - Second script (p2) ID
 * @param winner - 'p1' if scriptA won, 'p2' if scriptB won, null for draw
 */
export function updateEloRatings(
  ratings: Map<string, number>,
  scriptA: string,
  scriptB: string,
  winner: 'p1' | 'p2' | null
): void {
  const rA = ratings.get(scriptA) ?? INITIAL_ELO;
  const rB = ratings.get(scriptB) ?? INITIAL_ELO;

  const eA = expectedScore(rA, rB);
  const eB = expectedScore(rB, rA);

  let sA: number, sB: number;
  if (winner === 'p1') {
    sA = 1;
    sB = 0;
  } else if (winner === 'p2') {
    sA = 0;
    sB = 1;
  } else {
    sA = 0.5;
    sB = 0.5;
  }

  ratings.set(scriptA, rA + K_FACTOR * (sA - eA));
  ratings.set(scriptB, rB + K_FACTOR * (sB - eB));
}

// ============================================
// BULK CALCULATION
// ============================================

export interface MatchResult {
  p1ScriptId: string;
  p2ScriptId: string;
  winner: 'p1' | 'p2' | null;
  createdAt: Date | string;
}

export interface RatingStats {
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  matchCount: number;
}

/**
 * Calculate ELO ratings and W/L/D stats from a list of matches
 * 
 * Matches are sorted by creation time to ensure deterministic ELO calculation.
 * 
 * @param matches - Array of match results
 * @returns Map of script ID to rating stats
 */
export function calculateRatings(matches: MatchResult[]): Map<string, RatingStats> {
  // Sort matches by creation time for deterministic ELO
  const sortedMatches = [...matches].sort((a, b) => {
    const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return timeA - timeB;
  });

  const eloRatings = new Map<string, number>();
  const stats = new Map<string, { wins: number; losses: number; draws: number }>();

  // Initialize stats helper
  const getStats = (scriptId: string) => {
    if (!stats.has(scriptId)) {
      stats.set(scriptId, { wins: 0, losses: 0, draws: 0 });
    }
    return stats.get(scriptId)!;
  };

  for (const match of sortedMatches) {
    const { p1ScriptId, p2ScriptId, winner } = match;

    // Update ELO
    updateEloRatings(eloRatings, p1ScriptId, p2ScriptId, winner);

    // Update W/L/D
    const p1Stats = getStats(p1ScriptId);
    const p2Stats = getStats(p2ScriptId);

    if (winner === 'p1') {
      p1Stats.wins++;
      p2Stats.losses++;
    } else if (winner === 'p2') {
      p2Stats.wins++;
      p1Stats.losses++;
    } else {
      p1Stats.draws++;
      p2Stats.draws++;
    }
  }

  // Build final results
  const results = new Map<string, RatingStats>();
  
  // Collect all script IDs that appear in matches
  const allScriptIds = new Set<string>();
  for (const match of matches) {
    allScriptIds.add(match.p1ScriptId);
    allScriptIds.add(match.p2ScriptId);
  }

  for (const scriptId of allScriptIds) {
    const scriptStats = stats.get(scriptId) ?? { wins: 0, losses: 0, draws: 0 };
    results.set(scriptId, {
      elo: Math.round(eloRatings.get(scriptId) ?? INITIAL_ELO),
      wins: scriptStats.wins,
      losses: scriptStats.losses,
      draws: scriptStats.draws,
      matchCount: scriptStats.wins + scriptStats.losses + scriptStats.draws,
    });
  }

  return results;
}
