// ============================================================
// GREED.exe - EffectsManager
// Central dispatcher that routes to CombatEffects + Hazards.
// Also owns screen-space effects (meltdown flash, glitch).
// ============================================================

import { CombatEffects } from '../combat/CombatEffects.js';

export class EffectsManager {
  constructor(scene) {
    this.combat  = new CombatEffects(scene);
    this._meltdownFlash = document.getElementById('meltdown-flash');
    this._meltdownActive = false;
    this._glitchTimer    = 0;
    this._screenShakeEl  = document.getElementById('ui-root');
  }

  // ── Delegation shortcuts ─────────────────────────────────

  spawnHit(x, y, z, dir, stolen = 0) {
    this.combat.spawnHit(x, y, z, dir, stolen);
  }

  spawnBigHit(x, y, z) {
    this.combat.spawnBigHit(x, y, z);
  }

  spawnDeath(x, y, z, droppedBits) {
    this.combat.spawnDeath(x, y, z, droppedBits);
  }

  spawnRespawn(x, y, z) {
    this.combat.spawnRespawn(x, y, z);
  }

  spawnBankComplete(x, y, z, amount) {
    this.combat.spawnBankComplete(x, y, z, amount);
  }

  spawnMostWanted(x, y, z) {
    this.combat.spawnMostWanted(x, y, z);
  }

  spawnAttackSwing(pos, yaw) {
    this.combat.spawnAttackSwing(pos, yaw);
  }

  spawnDash(pos, yaw) {
    this.combat.spawnDash(pos, yaw);
  }

  spawnTrail(pos, heldBits) {
    this.combat.spawnTrail(pos, heldBits);
  }

  spawnLand(pos) {
    this.combat.spawnLand(pos);
  }

  spawnRevengeBlast(x, y, z) {
    this.combat.spawnRevengeBlast(x, y, z);
  }

  // ── Screen-space effects ─────────────────────────────────

  /** Activate the meltdown red pulse overlay */
  startMeltdown() {
    this._meltdownActive = true;
    if (this._meltdownFlash) {
      this._meltdownFlash.style.opacity = '1';
      this._meltdownFlash.style.animation = 'meltdown-pulse 1.2s ease-in-out infinite alternate';
    }
  }

  stopMeltdown() {
    this._meltdownActive = false;
    if (this._meltdownFlash) {
      this._meltdownFlash.style.opacity = '0';
      this._meltdownFlash.style.animation = '';
    }
  }

  /** Quick flash on hit received */
  flashScreen(color = 'rgba(255,80,0,0.3)', durationMs = 120) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0;
      background: ${color};
      pointer-events: none;
      z-index: 60;
      transition: opacity ${durationMs}ms ease-out;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), durationMs + 50);
    });
  }

  /** Bank complete screen pulse */
  bankSuccessPulse() {
    this.flashScreen('rgba(0,255,136,0.25)', 300);
  }

  /** Most Wanted activation flash */
  mostWantedFlash() {
    this.flashScreen('rgba(255,34,68,0.4)', 400);
  }

  /** Meltdown screen glitch every few seconds */
  triggerGlitch() {
    const el = document.getElementById('ui-root');
    if (!el) return;
    el.style.transform = `translate(${_rand(-3, 3)}px, ${_rand(-2, 2)}px)`;
    el.style.filter    = `hue-rotate(${_rand(0, 90)}deg) brightness(1.3)`;
    setTimeout(() => {
      el.style.transform = '';
      el.style.filter    = '';
    }, 80);
  }

  // ── Per-frame ────────────────────────────────────────────
  update(dt, camera) {
    this.combat.update(dt, camera);

    if (this._meltdownActive) {
      this._glitchTimer += dt;
      if (this._glitchTimer > 4.0) {
        this._glitchTimer = 0;
        this.triggerGlitch();
      }
    }
  }

  dispose() {
    this.combat.dispose();
    this.stopMeltdown();
  }
}

function _rand(min, max) {
  return min + Math.random() * (max - min);
}
