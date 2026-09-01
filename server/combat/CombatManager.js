// ============================================================
// GREED.exe - CombatManager
// Attack validation, knockback, kills, BITS stealing
// ============================================================

import {
  GAME_CONFIG,
  PLAYER_STATES,
  ROUND_STATES,
  SPAWN_POSITIONS,
} from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

export class CombatManager {
  constructor(room) {
    this.room = room;
  }

  // ── Attack ────────────────────────────────────────────────
  handleAttack(attackerId, msg) {
    const room = this.room;
    if (room.state === ROUND_STATES.LOBBY || room.state === ROUND_STATES.RESULTS) return;

    const attacker = room.playerManager.getPlayer(attackerId);
    if (!attacker || attacker.state !== PLAYER_STATES.ALIVE) return;

    const now = Date.now();

    // Cooldown check
    if (now - attacker.lastAttackTime < GAME_CONFIG.ATTACK_COOLDOWN * GAME_CONFIG.ATTACK_FREQ_TOLERANCE) {
      return; // Too fast — ignore
    }
    attacker.lastAttackTime = now;

    // Find nearby players in range
    const range = GAME_CONFIG.ATTACK_RANGE;
    const hits  = [];

    for (const target of room.playerManager.getAllPlayers()) {
      if (target.id === attackerId) continue;
      if (target.state !== PLAYER_STATES.ALIVE) continue;

      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= range) {
        hits.push({ target, dist, dx, dz });
      }
    }

    if (hits.length === 0) return;

    // Sort by closest
    hits.sort((a, b) => a.dist - b.dist);

    for (const { target, dx, dz, dist } of hits.slice(0, 3)) {
      this._processHit(attacker, target, dx, dz, dist, now);
    }
  }

  _processHit(attacker, target, dx, dz, dist, now) {
    // Shield check
    if (target.shieldUntil > now) return;

    const kb          = attacker.getKnockbackDealt() * target.getKnockbackReceived();
    const dirLen      = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    const nx          = dx / dirLen;
    const nz          = dz / dirLen;

    // Apply knockback velocity
    target.vx += nx * kb;
    target.vy += 6;
    target.vz += nz * kb;

    // Thief upgrade: steal bits
    let stolenAmount = 0;
    if (attacker.hasUpgrade('thief') && target.heldBits > 0) {
      stolenAmount = Math.floor(target.heldBits * GAME_CONFIG.THIEF_STEAL_PERCENT);
      if (stolenAmount > 0) {
        target.heldBits -= stolenAmount;
        attacker.addHeldBits(stolenAmount);
        attacker.stolen += stolenAmount;

        // Rival tracking
        this._trackRivalry(attacker.id, target.id);
      }
    }

    // Kill if launched into a pit?  (Handled by pit detection in PlayerManager)
    // Mark attacker
    attacker.kills; // no increment here — only increment on confirmed kill

    // Broadcast hit
    this.room.broadcast(MSG.PLAYER_HIT, {
      attackerId:  attacker.id,
      targetId:    target.id,
      knockback:   { x: nx * kb, y: 6, z: nz * kb },
      stolen:      stolenAmount,
      targetHeld:  target.heldBits,
    });

    // Most Wanted kill bonus
    if (target.isMostWanted) {
      attacker.addHeldBits(GAME_CONFIG.MOST_WANTED_KILL_BONUS);
      attacker.mostWantedKills++;
      this.room.broadcast(MSG.MOST_WANTED_CLEAR, {});
      // Re-evaluate after a tick
    }

    // King kill bonus
    if (this.room.kingId === target.id) {
      attacker.addHeldBits(GAME_CONFIG.KING_KILL_BONUS);
    }

    // Rival bonus
    if (attacker.rivalId === target.id) {
      attacker.addHeldBits(GAME_CONFIG.CHIPS_RIVAL_KILL); // small bit bonus
    }
  }

  // ── Kill ─────────────────────────────────────────────────
  killPlayer(playerId, killerId, cause = 'hit') {
    const room = this.room;
    const p    = room.playerManager.getPlayer(playerId);
    if (!p || p.state !== PLAYER_STATES.ALIVE) return;

    const now     = Date.now();
    const dropped = p.die(now);

    // Credit killer
    if (killerId && killerId !== playerId) {
      const killer = room.playerManager.getPlayer(killerId);
      if (killer) {
        killer.kills++;
        this._trackRivalry(killerId, playerId);
      }
    }

    // Scatter dropped bits
    if (dropped > 0) {
      room.bitManager.scatterBits(p.x, p.y, p.z, dropped);
    }

    // Volatile upgrade: giant explosion of bits
    if (p.hasUpgrade('volatile') && dropped > 0) {
      room.bitManager.scatterBits(p.x, p.y, p.z, dropped);
    }

    // Broadcast
    room.broadcast(MSG.PLAYER_DIED, {
      playerId,
      killerId:    killerId || null,
      cause,
      droppedBits: dropped,
      x: p.x, y: p.y, z: p.z,
    });

    console.log(`[Room ${room.id}] ${p.name} died (dropped ${dropped} bits)`);
  }

  // ── Revenge Blast (upgrade) ───────────────────────────────
  createRevengBlast(playerId, pos) {
    const room   = this.room;
    const caster = room.playerManager.getPlayer(playerId);
    if (!caster) return;

    const radius = GAME_CONFIG.REVENGE_BLAST_RADIUS;
    const force  = GAME_CONFIG.REVENGE_BLAST_FORCE;

    for (const target of room.playerManager.getAllPlayers()) {
      if (target.id === playerId) continue;
      if (target.state !== PLAYER_STATES.ALIVE) continue;

      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= radius) {
        const nx = dx / Math.max(0.01, dist);
        const nz = dz / Math.max(0.01, dist);
        target.vx += nx * force;
        target.vy += 8;
        target.vz += nz * force;

        room.broadcast(MSG.PLAYER_HIT, {
          attackerId: playerId,
          targetId:   target.id,
          knockback:  { x: nx * force, y: 8, z: nz * force },
          stolen: 0,
          targetHeld: target.heldBits,
          cause: 'revenge_blast',
        });
      }
    }
  }

  // ── Rivalry ───────────────────────────────────────────────
  _trackRivalry(aggressorId, victimId) {
    const aggressor = this.room.playerManager.getPlayer(aggressorId);
    if (!aggressor) return;

    if (!aggressor.rivalData[victimId]) aggressor.rivalData[victimId] = 0;
    aggressor.rivalData[victimId]++;

    // If crossed threshold and victim is not already the rival
    if (
      aggressor.rivalData[victimId] >= GAME_CONFIG.RIVAL_STEAL_THRESHOLD &&
      aggressor.rivalId !== victimId
    ) {
      aggressor.rivalId = victimId;
      const victim = this.room.playerManager.getPlayer(victimId);
      this.room.sendToPlayer(aggressorId, MSG.RIVAL_SET, {
        rivalId:   victimId,
        rivalName: victim?.name || '???',
      });
    }
  }
}
