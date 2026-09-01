// ============================================================
// GREED.exe - CombatEffects
// All in-world hit/death/respawn/bank visual feedback
// ============================================================

import * as THREE from 'three';

const _POOL_SIZE_HIT    = 48;
const _POOL_SIZE_TRAIL  = 96;
const _POOL_SIZE_SHARDS = 64;

export class CombatEffects {
  constructor(scene) {
    this.scene = scene;

    // Object pools
    this._hitSparks   = _makePool(scene, _POOL_SIZE_HIT,    _sparkMesh);
    this._trailParts  = _makePool(scene, _POOL_SIZE_TRAIL,  _trailMesh);
    this._shards      = _makePool(scene, _POOL_SIZE_SHARDS, _shardMesh);

    // Impact flash ring pool
    this._flashRings  = [];
    for (let i = 0; i < 12; i++) {
      const ring = _makeFlashRing();
      ring.visible = false;
      scene.add(ring);
      this._flashRings.push({ mesh: ring, active: false, life: 0 });
    }

    // Death explosion rings
    this._deathRings = [];
    for (let i = 0; i < 6; i++) {
      const r = _makeDeathRing();
      r.visible = false;
      scene.add(r);
      this._deathRings.push({ mesh: r, active: false, life: 0, startScale: 1 });
    }

    // Bank complete pulses
    this._bankPulses = [];
    for (let i = 0; i < 8; i++) {
      const r = _makeBankPulse();
      r.visible = false;
      scene.add(r);
      this._bankPulses.push({ mesh: r, active: false, life: 0 });
    }

    // Dash trails
    this._dashTrails = [];
    for (let i = 0; i < 20; i++) {
      const m = _makeDashTrail();
      m.visible = false;
      scene.add(m);
      this._dashTrails.push({ mesh: m, active: false, life: 0 });
    }

    // Floating damage numbers (DOM, not Three.js)
    this._floatingNums = [];
  }

  // ── Hit effect ────────────────────────────────────────────
  spawnHit(x, y, z, knockbackDir, stolen = 0) {
    // Impact sparks
    _burstFromPool(this._hitSparks, x, y + 0.8, z, 6, {
      speed: [4, 10],
      life:  [0.3, 0.6],
      color: 0xff8800,
      gravity: -18,
    });

    // Flash ring
    _activateFlashRing(this._flashRings, x, y + 0.6, z, 0xff6600);

    // Floating text
    if (stolen > 0) {
      this._spawnFloatingNum(`-${stolen}`, x, y + 1.8, z, '#ff2244');
    }
  }

  // ── Large knockback effect ────────────────────────────────
  spawnBigHit(x, y, z) {
    _burstFromPool(this._hitSparks, x, y + 0.8, z, 14, {
      speed:   [6, 16],
      life:    [0.4, 0.8],
      color:   0xff3300,
      gravity: -20,
    });
    _burstFromPool(this._shards, x, y + 0.5, z, 8, {
      speed:   [5, 12],
      life:    [0.5, 1.0],
      color:   0xff8800,
      gravity: -14,
    });
    _activateFlashRing(this._flashRings, x, y + 0.6, z, 0xff2200, 1.8);
  }

  // ── Death explosion ───────────────────────────────────────
  spawnDeath(x, y, z, droppedBits) {
    // Big particle burst
    _burstFromPool(this._hitSparks, x, y + 0.5, z, 20, {
      speed:   [5, 18],
      life:    [0.6, 1.2],
      color:   0xffd700,
      gravity: -12,
    });
    _burstFromPool(this._shards, x, y + 0.5, z, 16, {
      speed:   [4, 14],
      life:    [0.8, 1.5],
      color:   0xff8800,
      gravity: -10,
    });

    // Expanding death rings
    for (let i = 0; i < 3; i++) {
      const slot = this._deathRings.find(r => !r.active);
      if (!slot) break;
      slot.active = true;
      slot.life   = 1.0;
      slot.mesh.position.set(x, 0.1 + i * 0.15, z);
      slot.mesh.scale.setScalar(0.5);
      slot.mesh.material.opacity = 0.8;
      slot.mesh.material.color.set(i === 0 ? 0xffd700 : 0xff4400);
      slot.mesh.visible = true;
    }

    // Floating bit count
    if (droppedBits > 0) {
      this._spawnFloatingNum(`-${droppedBits} BITS`, x, y + 2.5, z, '#ff2244', true);
    }
  }

  // ── Respawn effect ────────────────────────────────────────
  spawnRespawn(x, y, z) {
    _burstFromPool(this._hitSparks, x, y + 0.5, z, 12, {
      speed:   [3, 8],
      life:    [0.4, 0.8],
      color:   0x00ff88,
      gravity: -10,
    });
    _activateFlashRing(this._flashRings, x, y + 0.3, z, 0x00ff88, 1.2);
    this._spawnFloatingNum('RESPAWN', x, y + 2, z, '#00ff88');
  }

  // ── Bank complete effect ──────────────────────────────────
  spawnBankComplete(x, y, z, amount) {
    _burstFromPool(this._hitSparks, x, y + 0.5, z, 16, {
      speed:   [3, 9],
      life:    [0.5, 1.0],
      color:   0x00ff88,
      gravity: -8,
    });

    // Bank pulse rings
    for (let i = 0; i < 3; i++) {
      const slot = this._bankPulses.find(r => !r.active);
      if (!slot) break;
      slot.active = true;
      slot.life   = 1.0;
      slot.mesh.position.set(x, 0.05 + i * 0.1, z);
      slot.mesh.scale.setScalar(0.3);
      slot.mesh.material.opacity = 0.9;
      slot.mesh.visible = true;
    }

    this._spawnFloatingNum(`+${amount} BANKED`, x, y + 2, z, '#00ff88', true);
  }

  // ── Most Wanted announcement effect ──────────────────────
  spawnMostWanted(x, y, z) {
    _burstFromPool(this._hitSparks, x, y + 1, z, 20, {
      speed:   [4, 12],
      life:    [0.6, 1.2],
      color:   0xff2244,
      gravity: -10,
    });
    _activateFlashRing(this._flashRings, x, y + 1, z, 0xff2244, 2.5);
  }

  // ── Attack swing arc ─────────────────────────────────────
  spawnAttackSwing(pos, yaw) {
    // Small arc of sparks in front of attacker
    for (let i = 0; i < 5; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const dist   = 1.5 + Math.random() * 1.5;
      const sx     = pos.x + Math.sin(yaw + spread) * dist;
      const sz     = pos.z + Math.cos(yaw + spread) * dist;
      _burstFromPool(this._hitSparks, sx, pos.y + 0.8, sz, 1, {
        speed:   [2, 5],
        life:    [0.15, 0.3],
        color:   0xffcc00,
        gravity: -20,
      });
    }
  }

  // ── Dash trail ────────────────────────────────────────────
  spawnDash(pos, yaw) {
    for (let i = 0; i < 8; i++) {
      const slot = this._dashTrails.find(d => !d.active);
      if (!slot) break;
      slot.active = true;
      slot.life   = 0.25 + i * 0.03;
      const behind = 0.3 * i;
      slot.mesh.position.set(
        pos.x - Math.sin(yaw) * behind,
        pos.y + 0.5,
        pos.z - Math.cos(yaw) * behind
      );
      slot.mesh.scale.setScalar(1.0 - i * 0.1);
      slot.mesh.material.opacity = 0.7 - i * 0.07;
      slot.mesh.visible = true;
    }
  }

  // ── Trail particle (for rich players) ────────────────────
  spawnTrail(pos, heldBits) {
    const level = Math.min(1, heldBits / 500);
    const count = Math.floor(level * 3) + 1;
    _burstFromPool(this._trailParts, pos.x, pos.y + 0.3, pos.z, count, {
      speed:   [0.5, 2],
      life:    [0.3, 0.8],
      color:   level > 0.6 ? 0xffd700 : 0x00ff88,
      gravity: 1,
    });
  }

  // ── Landing effect ────────────────────────────────────────
  spawnLand(pos) {
    _burstFromPool(this._hitSparks, pos.x, 0.1, pos.z, 5, {
      speed:   [2, 5],
      life:    [0.2, 0.4],
      color:   0x00ff88,
      gravity: -6,
    });
  }

  // ── Revenge blast ─────────────────────────────────────────
  spawnRevengeBlast(x, y, z) {
    _burstFromPool(this._shards, x, y + 0.5, z, 24, {
      speed:   [6, 20],
      life:    [0.5, 1.0],
      color:   0xaa00ff,
      gravity: -12,
    });
    for (let i = 0; i < 4; i++) {
      const slot = this._deathRings.find(r => !r.active);
      if (!slot) break;
      slot.active = true;
      slot.life   = 1.2;
      slot.mesh.position.set(x, 0.1 + i * 0.2, z);
      slot.mesh.scale.setScalar(0.3);
      slot.mesh.material.color.set(0xaa00ff);
      slot.mesh.material.opacity = 0.9;
      slot.mesh.visible = true;
    }
  }

  // ── DOM floating numbers ─────────────────────────────────
  _spawnFloatingNum(text, x, y, z, color = '#ffffff', big = false) {
    const el = document.createElement('div');
    el.className = 'floating-num';
    el.textContent = text;
    el.style.cssText = `
      position: fixed;
      font-family: 'Courier New', monospace;
      font-size: ${big ? '1.6rem' : '1.1rem'};
      font-weight: 900;
      color: ${color};
      text-shadow: 0 0 12px ${color};
      pointer-events: none;
      z-index: 500;
      white-space: nowrap;
      letter-spacing: 0.1em;
      transform: translate(-50%, -50%);
      transition: none;
    `;
    document.body.appendChild(el);

    // Store with 3D world pos for camera projection
    this._floatingNums.push({
      el,
      worldPos: new THREE.Vector3(x, y, z),
      life: big ? 2.0 : 1.4,
      vy: 1.5,
    });
  }

  // ── Update ────────────────────────────────────────────────
  update(dt, camera) {
    const now = performance.now() * 0.001;

    // Hit sparks
    _tickPool(this._hitSparks, dt);
    _tickPool(this._trailParts, dt);
    _tickPool(this._shards, dt);

    // Flash rings
    for (const r of this._flashRings) {
      if (!r.active) continue;
      r.life -= dt * 3;
      if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.mesh.scale.x + dt * 8);
      r.mesh.material.opacity = r.life * 0.7;
    }

    // Death rings
    for (const r of this._deathRings) {
      if (!r.active) continue;
      r.life -= dt * 1.2;
      if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.mesh.scale.x + dt * 12);
      r.mesh.material.opacity = r.life * 0.6;
    }

    // Bank pulses
    for (const r of this._bankPulses) {
      if (!r.active) continue;
      r.life -= dt * 1.5;
      if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.mesh.scale.x + dt * 10);
      r.mesh.material.opacity = r.life * 0.7;
    }

    // Dash trails
    for (const d of this._dashTrails) {
      if (!d.active) continue;
      d.life -= dt * 4;
      if (d.life <= 0) { d.active = false; d.mesh.visible = false; continue; }
      d.mesh.material.opacity = d.life * 0.6;
      d.mesh.scale.multiplyScalar(0.96);
    }

    // Floating numbers (project 3D → screen)
    if (camera) {
      const width  = window.innerWidth;
      const height = window.innerHeight;

      for (let i = this._floatingNums.length - 1; i >= 0; i--) {
        const n = this._floatingNums[i];
        n.life -= dt;
        if (n.life <= 0) {
          n.el.remove();
          this._floatingNums.splice(i, 1);
          continue;
        }

        n.worldPos.y += n.vy * dt;
        const projected = n.worldPos.clone().project(camera);
        const sx = (projected.x  * 0.5 + 0.5) * width;
        const sy = (-projected.y * 0.5 + 0.5) * height;

        if (projected.z < 1) {
          n.el.style.left    = `${sx}px`;
          n.el.style.top     = `${sy}px`;
          n.el.style.opacity = Math.min(1, n.life);
          n.el.style.display = 'block';
        } else {
          n.el.style.display = 'none';
        }
      }
    }
  }

  dispose() {
    [...this._hitSparks, ...this._trailParts, ...this._shards].forEach(p => {
      this.scene.remove(p.mesh);
    });
    [...this._flashRings, ...this._deathRings, ...this._bankPulses].forEach(r => {
      this.scene.remove(r.mesh);
    });
    this._dashTrails.forEach(d => this.scene.remove(d.mesh));
    this._floatingNums.forEach(n => n.el.remove());
  }
}

// ── Pool helpers ───────────────────────────────────────────────

function _makePool(scene, size, factory) {
  const pool = [];
  for (let i = 0; i < size; i++) {
    const mesh = factory();
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, life: 0, vx: 0, vy: 0, vz: 0, gravity: -14 });
  }
  return pool;
}

function _burstFromPool(pool, x, y, z, count, opts) {
  const { speed, life, color, gravity = -14 } = opts;
  let spawned = 0;
  for (const p of pool) {
    if (p.active) continue;
    p.active = true;
    p.life   = life[0] + Math.random() * (life[1] - life[0]);
    p.gravity = gravity;
    p.mesh.material.color.set(color);
    p.mesh.material.opacity = 1;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    const a  = Math.random() * Math.PI * 2;
    const el = (Math.random() - 0.3) * Math.PI;
    const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
    p.vx = Math.cos(a) * Math.cos(el) * sp;
    p.vy = Math.sin(el) * sp;
    p.vz = Math.sin(a) * Math.cos(el) * sp;
    spawned++;
    if (spawned >= count) break;
  }
}

function _tickPool(pool, dt) {
  for (const p of pool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
    p.vy += p.gravity * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = Math.max(0, p.life * 1.5);
    p.mesh.scale.multiplyScalar(0.97);
    p.mesh.rotation.x += 4 * dt;
    p.mesh.rotation.z += 3 * dt;
  }
}

function _activateFlashRing(pool, x, y, z, color, startScale = 0.5) {
  const slot = pool.find(r => !r.active);
  if (!slot) return;
  slot.active = true;
  slot.life   = 1.0;
  slot.mesh.position.set(x, y, z);
  slot.mesh.scale.setScalar(startScale);
  slot.mesh.material.color.set(color);
  slot.mesh.material.opacity = 0.8;
  slot.mesh.visible = true;
}

// ── Mesh factories ─────────────────────────────────────────────

function _sparkMesh() {
  const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

function _trailMesh() {
  const geo = new THREE.OctahedronGeometry(0.1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

function _shardMesh() {
  const geo = new THREE.TetrahedronGeometry(0.12, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

function _makeFlashRing() {
  const geo = new THREE.RingGeometry(0.5, 0.8, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.8,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function _makeDeathRing() {
  const geo = new THREE.RingGeometry(0.6, 1.1, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd700, transparent: true, opacity: 0.8,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function _makeBankPulse() {
  const geo = new THREE.RingGeometry(0.5, 0.9, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff88, transparent: true, opacity: 0.8,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function _makeDashTrail() {
  const geo = new THREE.SphereGeometry(0.4, 6, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00eeff, transparent: true, opacity: 0.5, depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}
