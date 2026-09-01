// ============================================================
// GREED.exe - Upgrade Definitions
// 21 upgrades across Common / Rare / High-Risk tiers
// ============================================================

export const UPGRADE_TIERS = {
  COMMON:    'COMMON',
  RARE:      'RARE',
  HIGH_RISK: 'HIGH_RISK',
};

export const UPGRADES = [
  // ── Common ────────────────────────────────────────────────
  {
    id:          'quick_feet',
    name:        'QUICK FEET',
    description: '+15% movement speed',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      10,
  },
  {
    id:          'heavy_hands',
    name:        'HEAVY HANDS',
    description: '+20% knockback dealt',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      10,
  },
  {
    id:          'bit_vacuum',
    name:        'BIT VACUUM',
    description: 'Much larger pickup radius',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      10,
  },
  {
    id:          'quick_dash',
    name:        'QUICK DASH',
    description: 'Dash cooldown reduced by 35%',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      10,
  },
  {
    id:          'spring_legs',
    name:        'SPRING LEGS',
    description: '+30% jump height',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      10,
  },
  {
    id:          'fast_transfer',
    name:        'FAST TRANSFER',
    description: 'Banking time halved',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      8,
  },
  {
    id:          'tough_skin',
    name:        'TOUGH SKIN',
    description: '-20% knockback received',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      8,
  },
  // ── Rare ─────────────────────────────────────────────────
  {
    id:          'bit_magnet',
    name:        'BIT MAGNET',
    description: 'Periodically pulls nearby BITs to you',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'heavy_hitter',
    name:        'HEAVY HITTER',
    description: '+60% knockback dealt',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'double_dash',
    name:        'DOUBLE DASH',
    description: 'Dash has a much faster recharge',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'bank_shield',
    name:        'BANK SHIELD',
    description: 'Brief invincibility after banking',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'thief',
    name:        'THIEF',
    description: 'Hits steal 5% of the victim\'s held BITs',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'phase_dash',
    name:        'PHASE DASH',
    description: 'Dash ignores player collision',
    tier:        UPGRADE_TIERS.RARE,
    weight:      5,
  },
  {
    id:          'revenge_blast',
    name:        'REVENGE BLAST',
    description: 'Respawning creates a knockback shockwave',
    tier:        UPGRADE_TIERS.RARE,
    weight:      4,
  },
  // ── High-Risk ────────────────────────────────────────────
  {
    id:          'gambler',
    name:        'GAMBLER',
    description: 'BITs worth ×2 — but you drop 50% more on death',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      3,
  },
  {
    id:          'greed_upgrade',
    name:        'GREED',
    description: 'Increased income while carrying lots of BITs',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      3,
  },
  {
    id:          'marked',
    name:        'MARKED',
    description: '×2 BITs — but your location is revealed every 5 seconds',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      3,
  },
  {
    id:          'glass_cannon',
    name:        'GLASS CANNON',
    description: '+120% knockback dealt AND received',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      3,
  },
  {
    id:          'jackpot',
    name:        'JACKPOT',
    description: '5% chance each pickup is worth ×10',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      3,
  },
  {
    id:          'volatile',
    name:        'VOLATILE',
    description: '+40% BIT income — but dying drops everything in a giant explosion',
    tier:        UPGRADE_TIERS.HIGH_RISK,
    weight:      2,
  },
  {
    id:          'lucky_streak',
    name:        'LUCKY STREAK',
    description: 'Every 4th BIT pickup is doubled',
    tier:        UPGRADE_TIERS.COMMON,
    weight:      7,
  },
];

// Build a lookup by id
export const UPGRADE_MAP = {};
for (const u of UPGRADES) {
  UPGRADE_MAP[u.id] = u;
}
