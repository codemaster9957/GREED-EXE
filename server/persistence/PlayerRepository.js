// ============================================================
// GREED.exe - PlayerRepository
// In-memory persistence stub.
// Swap out for PostgreSQL by replacing the read/write methods.
// ============================================================

// In-memory store: playerId → profile
const store = new Map();

export const PlayerRepository = {
  /**
   * Load a player profile by guest ID.
   * Returns null if not found.
   */
  async getProfile(playerId) {
    return store.get(playerId) || null;
  },

  /**
   * Create or update a player profile.
   */
  async upsertProfile(profile) {
    const existing = store.get(profile.id) || _defaultProfile(profile.id, profile.name);
    const merged   = { ...existing, ...profile, updatedAt: Date.now() };
    store.set(profile.id, merged);
    return merged;
  },

  /**
   * Update specific fields on a profile.
   */
  async updateProfile(playerId, fields) {
    const existing = store.get(playerId);
    if (!existing) return null;
    const updated = { ...existing, ...fields, updatedAt: Date.now() };
    store.set(playerId, updated);
    return updated;
  },

  /**
   * Get global leaderboard for a specific stat.
   * stat: 'totalBanked' | 'wins' | 'biggestCashout' | 'totalStolen' |
   *       'mostWantedKills' | 'biggestFumble' | 'highestKingStreak'
   */
  async getLeaderboard(stat, limit = 10) {
    const profiles = [...store.values()];
    return profiles
      .sort((a, b) => (b[stat] || 0) - (a[stat] || 0))
      .slice(0, limit)
      .map(p => ({
        playerId: p.id,
        name:     p.name,
        value:    p[stat] || 0,
      }));
  },

  getPlayerCount() {
    return store.size;
  },
};

function _defaultProfile(id, name) {
  return {
    id,
    name:               name || 'Player',
    chips:              0,
    wins:               0,
    totalBanked:        0,
    biggestCashout:     0,
    totalStolen:        0,
    mostWantedKills:    0,
    biggestFumble:      0,
    highestKingStreak:  0,
    gamesPlayed:        0,
    cosmeticsOwned:     ['default'],
    equippedCosmetics:  { trail: 'default', hitEffect: 'default', deathEffect: 'default' },
    createdAt:          Date.now(),
    updatedAt:          Date.now(),
  };
}

/*
─── PostgreSQL migration guide ────────────────────────────────
Replace this file's implementations with pg Pool queries.
The interface (getProfile, upsertProfile, updateProfile,
getLeaderboard) stays the same — only the storage layer changes.

Example schema:

CREATE TABLE players (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  chips               INTEGER DEFAULT 0,
  wins                INTEGER DEFAULT 0,
  total_banked        BIGINT  DEFAULT 0,
  biggest_cashout     INTEGER DEFAULT 0,
  total_stolen        INTEGER DEFAULT 0,
  most_wanted_kills   INTEGER DEFAULT 0,
  biggest_fumble      INTEGER DEFAULT 0,
  highest_king_streak INTEGER DEFAULT 0,
  games_played        INTEGER DEFAULT 0,
  cosmetics_owned     JSONB   DEFAULT '["default"]',
  equipped_cosmetics  JSONB   DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
──────────────────────────────────────────────────────────────
*/
