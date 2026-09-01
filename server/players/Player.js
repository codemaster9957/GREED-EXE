// ============================================================
// GREED.exe - Player (server-side)
// ============================================================

import { GAME_CONFIG, PLAYER_STATES, SPAWN_POSITIONS } from '../../shared/constants.js';

let _spawnIndex = 0;

export class Player {
  constructor(id, name, connectionId) {
    this.id           = id;
    this.name         = name;
    this.connectionId = connectionId;

    // Position / physics
    const spawn = SPAWN_POSITIONS[_spawnIndex % SPAWN_POSITIONS.length];
    _spawnIndex++;
    this.x  = spawn.x;
    this.y  = spawn.y;
    this.z  = spawn.z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0; // horizontal look direction (radians)

    // Game state
    this.state       = PLAYER_STATES.ALIVE;
    this.heldBits    = 0;
    this.bankedBits  = 0;
    this.kills       = 0;
    this.deaths      = 0;
    this.stolen      = 0;      // bits stolen from others
    this.mostWantedKills = 0;
    this.biggestSingleBank = 0;
    this.highestHeld = 0;
    this.biggestFumble = 0;

    // Banking
    this.isBanking      = false;
    this.bankStartTime  = 0;
    this.bankZoneIndex  = -1;

    // Cooldowns (server timestamps ms)
    this.lastAttackTime = 0;
    this.lastDashTime   = 0;
    this.respawnTime    = 0;

    // Upgrades (list of upgrade ids)
    this.upgrades       = [];
    this.nextUpgradeAt  = 0; // seconds into round

    // Most Wanted
    this.isMostWanted   = false;

    // Shield (from BANK_SHIELD upgrade)
    this.shieldUntil    = 0;

    // Rival tracking: playerId → times stolen/killed
    this.rivalData      = {};
    this.rivalId        = null;

    // Chips (persistent meta currency)
    this.chips          = 0;

    // Session stats
    this.pendingChipReward = 0;

    // Anti-cheat
    this.lastKnownTime  = Date.now();

    // Magnet upgrade timer
    this.lastMagnetTime = 0;
  }

  // ── Upgrade helpers ──────────────────────────────────────
  hasUpgrade(id) {
    return this.upgrades.includes(id);
  }

  addUpgrade(id) {
    if (!this.upgrades.includes(id)) {
      this.upgrades.push(id);
    }
  }

  // ── Derived stats with upgrade modifiers ─────────────────
  getMoveSpeed() {
    let speed = GAME_CONFIG.MOVE_SPEED;
    if (this.hasUpgrade('quick_feet'))  speed *= 1.15;
    return speed;
  }

  getKnockbackDealt() {
    let kb = GAME_CONFIG.ATTACK_KNOCKBACK;
    if (this.hasUpgrade('heavy_hands'))  kb *= 1.20;
    if (this.hasUpgrade('heavy_hitter')) kb *= 1.60;
    if (this.hasUpgrade('glass_cannon')) kb *= GAME_CONFIG.GLASS_CANNON_KNOCKBACK_DEALT;
    return kb;
  }

  getKnockbackReceived() {
    let mult = 1.0;
    if (this.hasUpgrade('glass_cannon')) mult *= GAME_CONFIG.GLASS_CANNON_KNOCKBACK_RECV;
    if (this.shieldUntil > Date.now())   mult  = 0;
    return mult;
  }

  getJumpForce() {
    let f = GAME_CONFIG.JUMP_FORCE;
    if (this.hasUpgrade('spring_legs')) f *= 1.30;
    return f;
  }

  getDashCooldown() {
    let cd = GAME_CONFIG.DASH_COOLDOWN;
    if (this.hasUpgrade('quick_dash'))   cd *= 0.65;
    if (this.hasUpgrade('double_dash'))  cd = GAME_CONFIG.DOUBLE_DASH_COOLDOWN;
    return cd;
  }

  getBankDuration() {
    let d = GAME_CONFIG.BANK_DURATION;
    if (this.hasUpgrade('fast_transfer')) d *= 0.55;
    return d;
  }

  getPickupRadius() {
    let r = GAME_CONFIG.BIT_PICKUP_RADIUS;
    if (this.hasUpgrade('bit_vacuum')) r *= 1.8;
    return r;
  }

  // ── Bit income modifier ───────────────────────────────────
  getBitValueMultiplier() {
    let mult = 1.0;
    if (this.hasUpgrade('gambler'))  mult *= GAME_CONFIG.GAMBLER_MULTIPLIER;
    if (this.hasUpgrade('marked'))   mult *= GAME_CONFIG.MARKED_BIT_MULTIPLIER;
    if (this.hasUpgrade('volatile')) mult *= (1 + GAME_CONFIG.VOLATILE_BIT_BONUS);
    if (this.hasUpgrade('greed_upgrade') && this.heldBits >= GAME_CONFIG.GREED_UPGRADE_THRESHOLD) {
      mult *= (1 + GAME_CONFIG.GREED_INCOME_BONUS);
    }
    return mult;
  }

  // ── Death ─────────────────────────────────────────────────
  die(now) {
    const dropped = Math.floor(this.heldBits * this._getDropPercent());
    this.biggestFumble = Math.max(this.biggestFumble, dropped);
    this.heldBits  -= dropped;
    this.deaths++;
    this.state       = PLAYER_STATES.DEAD;
    this.isBanking   = false;
    this.respawnTime = now + GAME_CONFIG.RESPAWN_DELAY;
    return dropped;
  }

  _getDropPercent() {
    let pct = GAME_CONFIG.BITS_DROPPED_ON_DEATH_PERCENT;
    if (this.hasUpgrade('gambler'))  pct = Math.min(0.95, pct * GAME_CONFIG.GAMBLER_DROP_MULTIPLIER);
    if (this.hasUpgrade('volatile')) pct = 1.0; // drops everything
    return pct;
  }

  respawn(spawnPos) {
    this.state = PLAYER_STATES.ALIVE;
    this.x     = spawnPos.x;
    this.y     = spawnPos.y;
    this.z     = spawnPos.z;
    this.vx    = 0;
    this.vy    = 0;
    this.vz    = 0;
    this.isBanking = false;

    // Revenge Blast will be triggered by CombatManager after respawn
  }

  // ── Bit management ────────────────────────────────────────
  addHeldBits(amount) {
    this.heldBits += amount;
    this.highestHeld = Math.max(this.highestHeld, this.heldBits);
  }

  bankBits() {
    const amount = this.heldBits;
    this.bankedBits   += amount;
    this.heldBits      = 0;
    this.isBanking     = false;
    this.biggestSingleBank = Math.max(this.biggestSingleBank, amount);
    return amount;
  }

  // ── Public state (safe to send to all clients) ────────────
  getPublicState() {
    return {
      id:           this.id,
      name:         this.name,
      x:            this.x,
      y:            this.y,
      z:            this.z,
      yaw:          this.yaw,
      vx:           this.vx,
      vy:           this.vy,
      vz:           this.vz,
      state:        this.state,
      heldBits:     this.heldBits,
      bankedBits:   this.bankedBits,
      isBanking:    this.isBanking,
      bankProgress: this.isBanking
        ? Math.min(1, (Date.now() - this.bankStartTime) / this.getBankDuration())
        : 0,
      isMostWanted: this.isMostWanted,
      upgrades:     this.upgrades,
      shielded:     this.shieldUntil > Date.now(),
    };
  }

  // ── Snapshot entry (compact for every tick) ───────────────
  getSnapshotEntry() {
    return {
      id:    this.id,
      x:     Math.round(this.x * 100) / 100,
      y:     Math.round(this.y * 100) / 100,
      z:     Math.round(this.z * 100) / 100,
      yaw:   Math.round(this.yaw * 1000) / 1000,
      vx:    Math.round(this.vx * 100) / 100,
      vy:    Math.round(this.vy * 100) / 100,
      vz:    Math.round(this.vz * 100) / 100,
      state: this.state,
      held:  this.heldBits,
      mw:    this.isMostWanted ? 1 : 0,
      sh:    this.shieldUntil > Date.now() ? 1 : 0,
    };
  }
}
