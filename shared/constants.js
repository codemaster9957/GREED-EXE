// ============================================================
// GREED.exe - Shared Constants
// Used by both client and server
// ============================================================

export const GAME_CONFIG = {
  // Room settings
  MAX_PLAYERS_PER_ROOM: 12,
  MIN_PLAYERS_TO_START: 2,
  LOBBY_COUNTDOWN: 10, // seconds

  // Round timings
  ROUND_DURATION: 180,       // 3 minutes in seconds
  MELTDOWN_DURATION: 45,     // seconds
  MELTDOWN_FINAL_COUNTDOWN: 10, // seconds

  // Respawn
  RESPAWN_DELAY: 3000, // ms

  // BIT spawning
  BIT_SPAWN_RATE: 800,         // ms between spawns
  BIT_SPAWN_RATE_MELTDOWN: 300,
  MAX_BITS_IN_WORLD: 150,
  BIT_VALUE_MIN: 1,
  BIT_VALUE_MAX: 5,
  BIT_VALUE_MELTDOWN_MULTIPLIER: 3,
  BIT_PICKUP_RADIUS: 2.2,      // units
  BIT_SCATTER_RADIUS: 5,
  BITS_DROPPED_ON_DEATH_PERCENT: 0.75, // 75% of held bits dropped

  // Banking
  BANK_DURATION: 1500,         // ms to complete banking
  BANK_RADIUS: 3.5,
  BANKS_CLOSED_ON_MELTDOWN: 2, // how many banks shut down

  // Combat
  ATTACK_RANGE: 3.0,
  ATTACK_COOLDOWN: 600,        // ms
  ATTACK_KNOCKBACK: 18,
  ATTACK_DAMAGE: 0,            // no HP system, just knockback
  DASH_COOLDOWN: 2000,         // ms
  DASH_SPEED: 28,
  DASH_DURATION: 180,          // ms
  DOUBLE_DASH_COOLDOWN: 1200,

  // Movement
  MOVE_SPEED: 9,
  SPRINT_MULTIPLIER: 1.55,
  JUMP_FORCE: 14,
  GRAVITY: -32,
  AIR_CONTROL: 0.4,
  FRICTION: 0.82,
  MAX_SPEED: 20,
  BANK_SHIELD_DURATION: 2000,

  // Most Wanted
  MOST_WANTED_THRESHOLD: 100,     // held bits to become most wanted
  MOST_WANTED_REVEAL_INTERVAL: 8, // seconds between location reveals
  MOST_WANTED_KILL_BONUS: 150,    // bits given to killer

  // Upgrade timing
  UPGRADE_INTERVAL: 30,           // seconds between upgrade offers
  UPGRADE_COUNT: 3,               // choices per offer

  // Physics / Anti-cheat tolerance
  MAX_SPEED_TOLERANCE: 1.5,       // multiplier tolerance for speed checks
  MAX_TELEPORT_DISTANCE: 25,      // units per tick before flagged
  ATTACK_FREQ_TOLERANCE: 0.85,    // fraction of cooldown allowed

  // Upgrades
  THIEF_STEAL_PERCENT: 0.05,      // 5% steal per hit
  MAGNET_RADIUS: 8,
  MAGNET_INTERVAL: 3000,          // ms
  GAMBLER_MULTIPLIER: 2,
  GAMBLER_DROP_MULTIPLIER: 1.5,
  GREED_UPGRADE_THRESHOLD: 50,
  GREED_INCOME_BONUS: 0.3,
  GLASS_CANNON_KNOCKBACK_DEALT: 2.2,
  GLASS_CANNON_KNOCKBACK_RECV: 2.2,
  JACKPOT_CHANCE: 0.05,
  JACKPOT_MULTIPLIER: 10,
  MARKED_BIT_MULTIPLIER: 2,
  MARKED_REVEAL_INTERVAL: 5,
  VOLATILE_BIT_BONUS: 0.4,
  VOLATILE_EXPLOSION_RADIUS: 8,
  REVENGE_BLAST_RADIUS: 6,
  REVENGE_BLAST_FORCE: 22,

  // CHIPS / rewards
  CHIPS_PER_BANKED_BIT: 0.1,
  CHIPS_PER_KILL: 15,
  CHIPS_PLACEMENT: [100, 70, 50, 30, 20, 15, 10, 5],
  CHIPS_MOST_WANTED_KILL: 25,
  CHIPS_KING_KILL: 20,
  CHIPS_RIVAL_KILL: 10,
  GREED_BUTTON_MULTIPLIER: 2,

  // Rival
  RIVAL_STEAL_THRESHOLD: 3,       // times stolen from to become rival

  // King streak bonuses
  KING_KILL_BONUS: 150,           // bits reward

  // Tick rate
  SERVER_TICK_RATE: 20,           // Hz
  SNAPSHOT_RATE: 20,              // Hz

  // Arena bounds (rough, enforced server-side)
  ARENA_HALF_WIDTH: 40,
  ARENA_HALF_DEPTH: 40,
  ARENA_HEIGHT_MIN: -5,
  ARENA_HEIGHT_MAX: 20,
};

// World positions of bank terminals
export const BANK_POSITIONS = [
  { x: -18, y: 0.5, z: -18 },
  { x:  18, y: 0.5, z: -18 },
  { x: -18, y: 0.5, z:  18 },
  { x:  18, y: 0.5, z:  18 },
  { x:   0, y: 4.0, z:   0 }, // elevated center bank - highest risk
];

export const SPAWN_POSITIONS = [
  { x: -20, y: 1, z: -20 },
  { x:  20, y: 1, z: -20 },
  { x: -20, y: 1, z:  20 },
  { x:  20, y: 1, z:  20 },
  { x:   0, y: 1, z: -25 },
  { x:   0, y: 1, z:  25 },
  { x: -25, y: 1, z:   0 },
  { x:  25, y: 1, z:   0 },
  { x: -12, y: 1, z: -12 },
  { x:  12, y: 1, z: -12 },
  { x: -12, y: 1, z:  12 },
  { x:  12, y: 1, z:  12 },
];

// High-value BIT spawn zones (center = more valuable)
export const BIT_SPAWN_ZONES = [
  { x: 0,   z: 0,   weight: 3, label: 'center' },
  { x: -8,  z: -8,  weight: 2, label: 'inner' },
  { x:  8,  z: -8,  weight: 2, label: 'inner' },
  { x: -8,  z:  8,  weight: 2, label: 'inner' },
  { x:  8,  z:  8,  weight: 2, label: 'inner' },
  { x: -20, z: -20, weight: 1, label: 'outer' },
  { x:  20, z: -20, weight: 1, label: 'outer' },
  { x: -20, z:  20, weight: 1, label: 'outer' },
  { x:  20, z:  20, weight: 1, label: 'outer' },
  { x:   0, z: -20, weight: 1, label: 'outer' },
  { x:   0, z:  20, weight: 1, label: 'outer' },
  { x: -20, z:   0, weight: 1, label: 'outer' },
  { x:  20, z:   0, weight: 1, label: 'outer' },
];

export const ROUND_STATES = {
  LOBBY: 'LOBBY',
  STARTING: 'STARTING',
  PLAYING: 'PLAYING',
  MELTDOWN: 'MELTDOWN',
  RESULTS: 'RESULTS',
};

export const PLAYER_STATES = {
  ALIVE: 'ALIVE',
  DEAD: 'DEAD',
  RESPAWNING: 'RESPAWNING',
  BANKING: 'BANKING',
};
