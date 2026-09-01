// ============================================================
// GREED.exe - BitManager
// Spawns, tracks, and validates BIT pickups
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  GAME_CONFIG,
  BIT_SPAWN_ZONES,
  ROUND_STATES,
  PLAYER_STATES,
} from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

export class BitManager {
  constructor(room) {
    this.room = room;
    this.bits = new Map(); // bitId → { id, x, y, z, value }

    this._spawnTimer = null;
    this._meltdown   = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────
  startSpawning() {
    this._meltdown = false;
    this._scheduleSpawn();
  }

  startMeltdownSpawning() {
    this._meltdown = true;
    // Faster — clear old timer, reschedule
    if (this._spawnTimer) clearTimeout(this._spawnTimer);
    this._scheduleSpawn();
  }

  stopSpawning() {
    if (this._spawnTimer) clearTimeout(this._spawnTimer);
    this._spawnTimer = null;
  }

  destroy() {
    this.stopSpawning();
    this.bits.clear();
  }

  // ── Spawning ──────────────────────────────────────────────
  _scheduleSpawn() {
    const rate = this._meltdown
      ? GAME_CONFIG.BIT_SPAWN_RATE_MELTDOWN
      : GAME_CONFIG.BIT_SPAWN_RATE;

    this._spawnTimer = setTimeout(() => {
      const roomState = this.room.state;
      if (roomState === ROUND_STATES.PLAYING || roomState === ROUND_STATES.MELTDOWN) {
        this._spawnBit();
      }
      this._scheduleSpawn();
    }, rate);
  }

  _spawnBit() {
    if (this.bits.size >= GAME_CONFIG.MAX_BITS_IN_WORLD) return;

    const zone  = _weightedZone();
    const jitter = 6;
    const x     = zone.x + (Math.random() - 0.5) * jitter;
    const z     = zone.z + (Math.random() - 0.5) * jitter;
    const y     = 0.5; // slightly above ground

    let value   = _randInt(GAME_CONFIG.BIT_VALUE_MIN, GAME_CONFIG.BIT_VALUE_MAX);
    if (this._meltdown) value *= GAME_CONFIG.BIT_VALUE_MELTDOWN_MULTIPLIER;

    // Centre zones slightly more valuable
    if (zone.label === 'center') value = Math.ceil(value * 1.5);

    const bit = { id: uuidv4().slice(0, 8), x, y, z, value };
    this.bits.set(bit.id, bit);

    this.room.broadcast(MSG.BIT_SPAWN, { bit });
  }

  // ── Scatter bits on death ─────────────────────────────────
  scatterBits(x, y, z, amount) {
    const bitsToSpawn = Math.min(Math.ceil(amount / 3), 60);
    const valueEach   = Math.max(1, Math.floor(amount / bitsToSpawn));
    const spawned     = [];

    for (let i = 0; i < bitsToSpawn; i++) {
      if (this.bits.size >= GAME_CONFIG.MAX_BITS_IN_WORLD) break;
      const angle  = Math.random() * Math.PI * 2;
      const radius = Math.random() * GAME_CONFIG.BIT_SCATTER_RADIUS;
      const bit = {
        id:    uuidv4().slice(0, 8),
        x:     x + Math.cos(angle) * radius,
        y:     0.5,
        z:     z + Math.sin(angle) * radius,
        value: valueEach,
      };
      this.bits.set(bit.id, bit);
      spawned.push(bit);
    }

    if (spawned.length > 0) {
      this.room.broadcast(MSG.BIT_DROPPED, { bits: spawned, origin: { x, y, z } });
    }
  }

  // ── Pickup validation ─────────────────────────────────────
  handlePickupRequest(playerId, msg) {
    const { bitIds } = msg;
    if (!Array.isArray(bitIds)) return;

    const player = this.room.playerManager.getPlayer(playerId);
    if (!player || player.state !== PLAYER_STATES.ALIVE) return;
    if (this.room.state === ROUND_STATES.RESULTS) return;

    const pickupRadius = player.getPickupRadius();
    const collected    = [];

    for (const bitId of bitIds.slice(0, 20)) { // max 20 per request
      const bit = this.bits.get(bitId);
      if (!bit) continue;

      // Distance check
      const dx = player.x - bit.x;
      const dz = player.z - bit.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > pickupRadius * 1.5) continue; // 1.5× server tolerance

      // Apply value multipliers
      let value = bit.value;
      value = Math.round(value * player.getBitValueMultiplier());

      // Jackpot upgrade check
      if (player.hasUpgrade('jackpot') && Math.random() < GAME_CONFIG.JACKPOT_CHANCE) {
        value = Math.round(value * GAME_CONFIG.JACKPOT_MULTIPLIER);
      }

      player.addHeldBits(value);
      this.bits.delete(bitId);

      collected.push({ bitId, value, total: player.heldBits });
    }

    if (collected.length > 0) {
      // Tell everyone the bits are gone
      this.room.broadcast(MSG.BIT_COLLECTED, {
        playerId,
        collected: collected.map(c => ({ bitId: c.bitId, value: c.value })),
        newHeld: player.heldBits,
      });
    }
  }

  // ── Bit Magnet upgrade ────────────────────────────────────
  attractBitsToPlayer(player) {
    const magnetRadius = GAME_CONFIG.MAGNET_RADIUS;
    const attracted    = [];

    for (const [bitId, bit] of this.bits) {
      const dx = player.x - bit.x;
      const dz = player.z - bit.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= magnetRadius) {
        let value = bit.value;
        value = Math.round(value * player.getBitValueMultiplier());
        player.addHeldBits(value);
        this.bits.delete(bitId);
        attracted.push({ bitId, value });
      }
    }

    if (attracted.length > 0) {
      this.room.broadcast(MSG.BIT_COLLECTED, {
        playerId: player.id,
        collected: attracted,
        newHeld: player.heldBits,
        magnet: true,
      });
    }
  }

  // ── Getters ───────────────────────────────────────────────
  getAllBits() {
    return [...this.bits.values()];
  }

  tick() {
    // Nothing per-tick currently; spawn is timer-based
  }
}

// ── Helpers ───────────────────────────────────────────────────
function _weightedZone() {
  const totalWeight = BIT_SPAWN_ZONES.reduce((s, z) => s + z.weight, 0);
  let r = Math.random() * totalWeight;
  for (const zone of BIT_SPAWN_ZONES) {
    r -= zone.weight;
    if (r <= 0) return zone;
  }
  return BIT_SPAWN_ZONES[0];
}

function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
