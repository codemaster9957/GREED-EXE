// ============================================================
// GREED.exe - MeltdownManager
// Controls the 45-second Meltdown phase, countdown, collapse
// ============================================================

import { GAME_CONFIG, ROUND_STATES } from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

// Platform indices that collapse during meltdown (room-specific)
const COLLAPSIBLE_PLATFORM_IDS = [2, 5, 7, 11, 14]; // matches Arena geometry

export class MeltdownManager {
  constructor(room) {
    this.room      = room;
    this.active    = false;
    this.countdown = 0;
    this._timer    = null;
    this._collapsed = [];
  }

  start() {
    this.active    = true;
    this.countdown = GAME_CONFIG.MELTDOWN_DURATION;
    this._collapsed = [];

    this.room.broadcast(MSG.MELTDOWN_START, {
      duration: GAME_CONFIG.MELTDOWN_DURATION,
      serverTime: Date.now(),
    });

    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), 1000);

    // Schedule platform collapses
    this._schedulePlatformCollapses();
  }

  _tick() {
    this.countdown--;

    // Broadcast every second during meltdown
    this.room.broadcast(MSG.MELTDOWN_TICK, {
      remaining: this.countdown,
      total:     GAME_CONFIG.MELTDOWN_DURATION,
      phase:     ROUND_STATES.MELTDOWN,
    });

    if (this.countdown <= 0) {
      this._end();
    }
  }

  _schedulePlatformCollapses() {
    // Collapse platforms at specific seconds into meltdown
    const collapseAt = [5, 12, 20, 30, 38];

    for (let i = 0; i < COLLAPSIBLE_PLATFORM_IDS.length; i++) {
      const platformId = COLLAPSIBLE_PLATFORM_IDS[i];
      const delay      = collapseAt[i] * 1000;

      setTimeout(() => {
        if (!this.active) return;
        this._collapsed.push(platformId);
        this.room.broadcast(MSG.PLATFORM_COLLAPSE, { platformId });
        console.log(`[Room ${this.room.id}] Platform ${platformId} collapsed`);
      }, delay);
    }
  }

  _end() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.active = false;
    this.room.roundManager.endRound();
  }

  reset() {
    this.active     = false;
    this.countdown  = 0;
    this._collapsed = [];
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getSnapshot() {
    return {
      active:     this.active,
      countdown:  this.countdown,
      collapsed:  [...this._collapsed],
    };
  }

  destroy() {
    this.reset();
  }
}
