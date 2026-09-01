// ============================================================
// GREED.exe - PlayerManager
// Manages all players in one room, handles input processing,
// server-side physics, banking, respawns
// ============================================================

import { Player } from './Player.js';
import {
  GAME_CONFIG,
  PLAYER_STATES,
  SPAWN_POSITIONS,
  BANK_POSITIONS,
  ROUND_STATES,
} from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

export class PlayerManager {
  constructor(room) {
    this.room    = room;
    this.players = new Map(); // playerId → Player
    this._connToPlayer = new Map(); // connectionId → playerId
    this._mostWantedId = null;
  }

  // ── CRUD ─────────────────────────────────────────────────
  addPlayer(playerId, name, connectionId) {
    if (this.players.has(playerId)) {
      // Reconnect — update connectionId
      const p = this.players.get(playerId);
      p.connectionId = connectionId;
      this._connToPlayer.set(connectionId, playerId);
      return p;
    }
    const player = new Player(playerId, name, connectionId);
    this.players.set(playerId, player);
    this._connToPlayer.set(connectionId, playerId);
    return player;
  }

  removePlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    this._connToPlayer.delete(p.connectionId);
    this.players.delete(playerId);

    // If was most wanted, clear
    if (this._mostWantedId === playerId) {
      this._clearMostWanted();
    }
  }

  getPlayer(playerId)      { return this.players.get(playerId) || null; }
  getCount()               { return this.players.size; }
  getAllPlayers()           { return [...this.players.values()]; }
  getConnectionId(pid)     { return this.getPlayer(pid)?.connectionId || null; }

  getAllPublicStates() {
    return this.getAllPlayers().map(p => p.getPublicState());
  }

  buildSnapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.getSnapshotEntry());
    }
    return { players };
  }

  // ── Input processing ─────────────────────────────────────
  handleInput(playerId, msg) {
    const p = this.players.get(playerId);
    if (!p || p.state !== PLAYER_STATES.ALIVE) return;
    if (this.room.state === ROUND_STATES.LOBBY) return;

    const { keys, yaw, dt: rawDt } = msg;
    if (!keys) return;

    const dt = Math.min(rawDt || 0.05, 0.1); // cap delta time

    // ── Anti-cheat: max dt ───────────────────────────────
    const speed = p.getMoveSpeed();
    const isGrounded = p.y <= 0.05;

    let moveX = 0, moveZ = 0;
    if (keys.w)  moveZ -= 1;
    if (keys.s)  moveZ += 1;
    if (keys.a)  moveX -= 1;
    if (keys.d)  moveX += 1;

    // Normalise diagonal
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    // Rotate input by yaw
    const cy  = Math.cos(yaw);
    const sy  = Math.sin(yaw);
    const wx  = moveX * cy - moveZ * sy;
    const wz  = moveX * sy + moveZ * cy;

    const isSprinting = keys.shift;
    const finalSpeed  = isSprinting
      ? speed * GAME_CONFIG.SPRINT_MULTIPLIER
      : speed;

    const accel = isGrounded ? 60 : 60 * GAME_CONFIG.AIR_CONTROL;

    // Accelerate toward desired velocity
    const targetVx = wx * finalSpeed;
    const targetVz = wz * finalSpeed;
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
    p.vz += (targetVz - p.vz) * Math.min(1, accel * dt);

    // Friction when not actively moving
    if (len === 0) {
      p.vx *= Math.pow(GAME_CONFIG.FRICTION, dt * 60);
      p.vz *= Math.pow(GAME_CONFIG.FRICTION, dt * 60);
    }

    // Jump
    if (keys.space && isGrounded) {
      p.vy = p.getJumpForce();
    }

    // Dash
    if (keys.dash) {
      const now = Date.now();
      if (now - p.lastDashTime > p.getDashCooldown()) {
        p.lastDashTime = now;
        const dashDir = len > 0 ? { x: wx, z: wz } : { x: Math.cos(yaw), z: Math.sin(yaw) };
        p.vx = dashDir.x * GAME_CONFIG.DASH_SPEED;
        p.vz = dashDir.z * GAME_CONFIG.DASH_SPEED;
      }
    }

    // Gravity
    p.vy += GAME_CONFIG.GRAVITY * dt;

    // Integrate position
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    // Ground collision
    if (p.y < 0) {
      p.y  = 0;
      p.vy = 0;
    }

    // Speed cap (anti-cheat)
    const hSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    const maxAllowed = GAME_CONFIG.MAX_SPEED * GAME_CONFIG.MAX_SPEED_TOLERANCE;
    if (hSpeed > maxAllowed) {
      const scale = maxAllowed / hSpeed;
      p.vx *= scale;
      p.vz *= scale;
    }

    // Arena boundary clamp
    p.x = Math.max(-GAME_CONFIG.ARENA_HALF_WIDTH,  Math.min(GAME_CONFIG.ARENA_HALF_WIDTH,  p.x));
    p.z = Math.max(-GAME_CONFIG.ARENA_HALF_DEPTH,  Math.min(GAME_CONFIG.ARENA_HALF_DEPTH,  p.z));

    // Update yaw
    p.yaw = yaw;

    // Pit detection (y < -4 = fell in)
    if (p.y < -4) {
      this._handlePitDeath(p);
    }

    // Banking zone check
    if (p.isBanking) {
      this._checkBankContinuation(p);
    }
  }

  // ── Banking ──────────────────────────────────────────────
  handleBankStart(playerId, msg) {
    const p = this.players.get(playerId);
    if (!p || p.state !== PLAYER_STATES.ALIVE || p.isBanking) return;
    if (this.room.state === ROUND_STATES.LOBBY || this.room.state === ROUND_STATES.RESULTS) return;
    if (p.heldBits <= 0) return;

    const zoneIndex = msg.zoneIndex;
    if (typeof zoneIndex !== 'number') return;

    // Check bank is open
    if (this.room.closedBankIds.includes(zoneIndex)) return;

    // Validate proximity
    const bpos = BANK_POSITIONS[zoneIndex];
    if (!bpos) return;
    const dx = p.x - bpos.x, dz = p.z - bpos.z;
    if (Math.sqrt(dx * dx + dz * dz) > GAME_CONFIG.BANK_RADIUS * 1.3) return;

    p.isBanking     = true;
    p.bankStartTime = Date.now();
    p.bankZoneIndex = zoneIndex;

    this.room.sendToPlayer(playerId, MSG.BANK_PROGRESS, { progress: 0 });
  }

  handleBankCancel(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.isBanking) {
      p.isBanking = false;
      this.room.sendToPlayer(playerId, MSG.BANK_CANCEL, {});
    }
  }

  _checkBankContinuation(p) {
    const bpos = BANK_POSITIONS[p.bankZoneIndex];
    if (!bpos) { p.isBanking = false; return; }

    const dx = p.x - bpos.x, dz = p.z - bpos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > GAME_CONFIG.BANK_RADIUS * 1.3) {
      // Left zone
      p.isBanking = false;
      this.room.sendToPlayer(p.id, MSG.BANK_CANCEL, { reason: 'left_zone' });
      return;
    }

    const elapsed = Date.now() - p.bankStartTime;
    const duration = p.getBankDuration();
    const progress = elapsed / duration;

    if (progress >= 1.0) {
      // Complete!
      const amount = p.bankBits();
      this.room.broadcast(MSG.BANK_COMPLETE, {
        playerId: p.id,
        amount,
        newBanked: p.bankedBits,
      });
      // Shield upgrade
      if (p.hasUpgrade('bank_shield')) {
        p.shieldUntil = Date.now() + GAME_CONFIG.BANK_SHIELD_DURATION;
      }
    } else {
      this.room.sendToPlayer(p.id, MSG.BANK_PROGRESS, { progress });
    }
  }

  // ── Most Wanted ──────────────────────────────────────────
  updateMostWanted() {
    let topPlayer = null;
    let topBits   = GAME_CONFIG.MOST_WANTED_THRESHOLD - 1;

    for (const p of this.players.values()) {
      if (p.state === PLAYER_STATES.ALIVE && p.heldBits > topBits) {
        topBits   = p.heldBits;
        topPlayer = p;
      }
    }

    const newMostWantedId = topPlayer ? topPlayer.id : null;

    if (newMostWantedId !== this._mostWantedId) {
      // Clear old
      if (this._mostWantedId) {
        const old = this.players.get(this._mostWantedId);
        if (old) old.isMostWanted = false;
      }

      this._mostWantedId = newMostWantedId;

      if (newMostWantedId) {
        topPlayer.isMostWanted = true;
        this.room.broadcast(MSG.MOST_WANTED_SET, {
          playerId: newMostWantedId,
          name:     topPlayer.name,
          heldBits: topPlayer.heldBits,
          killReward: GAME_CONFIG.MOST_WANTED_KILL_BONUS,
        });
      } else {
        this.room.broadcast(MSG.MOST_WANTED_CLEAR, {});
      }
    }
  }

  getMostWantedId() { return this._mostWantedId; }

  _clearMostWanted() {
    if (this._mostWantedId) {
      const p = this.players.get(this._mostWantedId);
      if (p) p.isMostWanted = false;
    }
    this._mostWantedId = null;
    this.room.broadcast(MSG.MOST_WANTED_CLEAR, {});
  }

  // ── Pit death ─────────────────────────────────────────────
  _handlePitDeath(p) {
    this.room.combatManager.killPlayer(p.id, null, 'pit');
  }

  // ── Per-tick ─────────────────────────────────────────────
  tick() {
    const now = Date.now();

    // Respawn check
    for (const p of this.players.values()) {
      if (p.state === PLAYER_STATES.DEAD && now >= p.respawnTime) {
        this._respawnPlayer(p, now);
      }

      // Marked upgrade: reveal position periodically
      if (p.hasUpgrade('marked') && p.state === PLAYER_STATES.ALIVE) {
        const interval = GAME_CONFIG.MARKED_REVEAL_INTERVAL * 1000;
        if (!p._lastMarkedReveal) p._lastMarkedReveal = now;
        if (now - p._lastMarkedReveal >= interval) {
          p._lastMarkedReveal = now;
          this.room.broadcast(MSG.MOST_WANTED_REVEAL, {
            playerId: p.id,
            x: p.x, y: p.y, z: p.z,
            reason: 'marked',
          });
        }
      }

      // Bit Magnet upgrade
      if (p.hasUpgrade('bit_magnet') && p.state === PLAYER_STATES.ALIVE) {
        if (now - p.lastMagnetTime >= GAME_CONFIG.MAGNET_INTERVAL) {
          p.lastMagnetTime = now;
          this.room.bitManager.attractBitsToPlayer(p);
        }
      }
    }

    // Most Wanted location reveal on timer
    if (this._mostWantedId) {
      const mw = this.players.get(this._mostWantedId);
      if (mw) {
        if (!this._lastMWReveal) this._lastMWReveal = now;
        if (now - this._lastMWReveal >= GAME_CONFIG.MOST_WANTED_REVEAL_INTERVAL * 1000) {
          this._lastMWReveal = now;
          this.room.broadcast(MSG.MOST_WANTED_REVEAL, {
            playerId: mw.id,
            x: mw.x, y: mw.y, z: mw.z,
            reason: 'most_wanted',
          });
        }
      }
    }

    // Update most wanted state
    if (this.room.state === ROUND_STATES.PLAYING || this.room.state === ROUND_STATES.MELTDOWN) {
      this.updateMostWanted();
    }
  }

  _respawnPlayer(p, now) {
    const spawnPos = SPAWN_POSITIONS[Math.floor(Math.random() * SPAWN_POSITIONS.length)];
    p.respawn(spawnPos);

    // Revenge Blast upgrade
    if (p.hasUpgrade('revenge_blast')) {
      this.room.combatManager.createRevengBlast(p.id, spawnPos);
    }

    this.room.broadcast(MSG.PLAYER_RESPAWNED, {
      playerId: p.id,
      x: spawnPos.x,
      y: spawnPos.y,
      z: spawnPos.z,
    });
  }
}
