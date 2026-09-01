// ============================================================
// GREED.exe - Shared Network Message Protocol
// All message type strings used by client and server
// Version: 1
// ============================================================

export const MSG = {
  // ── Connection ──────────────────────────────────────────
  JOIN:               'JOIN',          // client → server: join room with player info
  JOIN_ACK:           'JOIN_ACK',      // server → client: confirmed, send room state
  PLAYER_JOINED:      'PLAYER_JOINED', // server → room: new player arrived
  PLAYER_LEFT:        'PLAYER_LEFT',   // server → room: player disconnected
  ROOM_STATE:         'ROOM_STATE',    // server → client: full initial state sync
  ERROR:              'ERROR',         // server → client: something went wrong

  // ── Ping / Keepalive ─────────────────────────────────────
  PING:               'PING',
  PONG:               'PONG',

  // ── Input ────────────────────────────────────────────────
  PLAYER_INPUT:       'PLAYER_INPUT',  // client → server: movement/action inputs

  // ── Snapshots ────────────────────────────────────────────
  WORLD_SNAPSHOT:     'WORLD_SNAPSHOT',// server → room: bulk positions + states

  // ── BITS ─────────────────────────────────────────────────
  BIT_SPAWN:          'BIT_SPAWN',     // server → room: new bit appeared
  BIT_SPAWN_BATCH:    'BIT_SPAWN_BATCH',
  BIT_COLLECTED:      'BIT_COLLECTED', // server → room: bit was picked up
  BIT_REMOVE:         'BIT_REMOVE',    // server → room: remove without collect
  BIT_DROPPED:        'BIT_DROPPED',   // server → room: scattered bits from death
  BIT_REQUEST_PICKUP: 'BIT_REQUEST_PICKUP', // client → server: "I touched a bit"

  // ── Combat ───────────────────────────────────────────────
  ATTACK:             'ATTACK',        // client → server: swung at direction
  PLAYER_HIT:         'PLAYER_HIT',   // server → room: hit confirmed + knockback
  PLAYER_DIED:        'PLAYER_DIED',  // server → room: player died
  PLAYER_RESPAWNED:   'PLAYER_RESPAWNED',

  // ── Banking ──────────────────────────────────────────────
  BANK_START:         'BANK_START',    // client → server: entered bank zone
  BANK_CANCEL:        'BANK_CANCEL',   // server/client: banking interrupted
  BANK_PROGRESS:      'BANK_PROGRESS', // server → client: progress update
  BANK_COMPLETE:      'BANK_COMPLETE', // server → room: successful bank

  // ── Upgrades ─────────────────────────────────────────────
  UPGRADE_OPTIONS:    'UPGRADE_OPTIONS', // server → client: 3 upgrade choices
  UPGRADE_SELECTED:   'UPGRADE_SELECTED',// client → server: picked upgrade
  UPGRADE_APPLIED:    'UPGRADE_APPLIED', // server → room: player has new upgrade

  // ── Most Wanted ──────────────────────────────────────────
  MOST_WANTED_SET:    'MOST_WANTED_SET',   // server → room: new most wanted
  MOST_WANTED_CLEAR:  'MOST_WANTED_CLEAR', // server → room
  MOST_WANTED_REVEAL: 'MOST_WANTED_REVEAL',// server → room: location broadcast

  // ── Round / Game State ───────────────────────────────────
  ROUND_STATE_CHANGE: 'ROUND_STATE_CHANGE',// server → room: state transition
  MELTDOWN_START:     'MELTDOWN_START',    // server → room
  MELTDOWN_TICK:      'MELTDOWN_TICK',     // server → room: countdown update
  ROUND_END:          'ROUND_END',         // server → room: scoring locked
  RESULTS:            'RESULTS',           // server → room: full results object
  LOBBY_COUNTDOWN:    'LOBBY_COUNTDOWN',   // server → room: seconds until next round
  BANK_CLOSED:        'BANK_CLOSED',       // server → room: meltdown shut a bank

  // ── King / Rival ─────────────────────────────────────────
  KING_UPDATE:        'KING_UPDATE',    // server → room: new king data
  RIVAL_SET:          'RIVAL_SET',      // server → client: you have a rival

  // ── CHIPS / Persistence ──────────────────────────────────
  CHIPS_UPDATE:       'CHIPS_UPDATE',   // server → client: chip balance changed
  GREED_BUTTON:       'GREED_BUTTON',   // client → server: gamble chips
  GREED_RESULT:       'GREED_RESULT',   // server → client: jackpot/bust

  // ── Chat / Social ─────────────────────────────────────────
  CHAT:               'CHAT',

  // ── Hazards ───────────────────────────────────────────────
  HAZARD_TRIGGER:     'HAZARD_TRIGGER', // server → room: hazard activated
  PLATFORM_COLLAPSE:  'PLATFORM_COLLAPSE', // server → room during meltdown

  // ── Debug ─────────────────────────────────────────────────
  DEBUG_STATE:        'DEBUG_STATE',
};

// Protocol version — bump when breaking changes happen
export const PROTOCOL_VERSION = 1;

/**
 * Wrap a payload with type and version metadata.
 * @param {string} type  - MSG constant
 * @param {object} data  - payload
 */
export function createMessage(type, data = {}) {
  return { type, v: PROTOCOL_VERSION, ...data };
}

/**
 * Parse a raw WebSocket message string.
 * Returns null on failure.
 */
export function parseMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
