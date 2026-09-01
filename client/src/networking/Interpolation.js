// ============================================================
// GREED.exe - Interpolation
// Smooth remote player movement using snapshot buffering.
//
// Each remote player keeps a ring-buffer of timestamped
// snapshots. On render we interpolate between the two
// snapshots that bracket (now - INTERP_DELAY).
// ============================================================

const INTERP_DELAY = 100;   // ms behind server — trades latency for smoothness
const BUFFER_SIZE  = 32;    // max snapshots per entity

export class EntityBuffer {
  constructor() {
    this._buf = [];  // { t, x, y, z, yaw, vx, vy, vz, state, held, mw, sh }
  }

  push(snapshot) {
    this._buf.push(snapshot);
    if (this._buf.length > BUFFER_SIZE) this._buf.shift();
  }

  /**
   * Returns interpolated state for render time `renderT`.
   * Falls back to the latest snapshot if buffer is too thin.
   */
  sample(renderT) {
    const buf = this._buf;
    if (buf.length === 0) return null;
    if (buf.length === 1) return buf[0];

    // Find the two snapshots bracketing renderT
    let before = buf[0];
    let after  = buf[buf.length - 1];

    for (let i = 1; i < buf.length; i++) {
      if (buf[i].t >= renderT) {
        after  = buf[i];
        before = buf[i - 1];
        break;
      }
    }

    const span = after.t - before.t;
    if (span <= 0) return after;

    const t = Math.max(0, Math.min(1, (renderT - before.t) / span));

    return {
      x:     lerp(before.x,   after.x,   t),
      y:     lerp(before.y,   after.y,   t),
      z:     lerp(before.z,   after.z,   t),
      yaw:   lerpAngle(before.yaw, after.yaw, t),
      vx:    lerp(before.vx,  after.vx,  t),
      vy:    lerp(before.vy,  after.vy,  t),
      vz:    lerp(before.vz,  after.vz,  t),
      state: after.state,
      held:  after.held,
      mw:    after.mw,
      sh:    after.sh,
    };
  }

  getRenderTime() {
    return Date.now() - INTERP_DELAY;
  }

  clear() { this._buf = []; }
}

// ── Math helpers ──────────────────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  // Shortest-path angle lerp
  let diff = b - a;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
