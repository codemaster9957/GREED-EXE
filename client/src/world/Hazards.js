// ============================================================
// GREED.exe - Hazards
// Jump pads, moving hazards, visual pit warnings,
// environment effects (meltdown fires, sparks)
// ============================================================

import * as THREE from 'three';

export class Hazards {
  constructor(scene, arena) {
    this.scene   = scene;
    this.arena   = arena;
    this._active = [];
    this._sparks = [];
    this._fires  = [];
    this._meltdownActive = false;

    this._buildMovingHazards();
    this._buildSparkPool();
  }

  // ── Moving hazards ────────────────────────────────────────
  _buildMovingHazards() {
    // Sweeping laser walls — purely visual, knockback logic is server-side
    const hazardMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Two rotating sweep arms in the center area
    const armGeo = new THREE.PlaneGeometry(18, 0.3);
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(armGeo, hazardMat.clone());
      arm.position.set(0, 0.5, 0);
      arm.rotation.x = -Math.PI / 2;
      this.scene.add(arm);
      this._active.push({
        mesh:    arm,
        type:    'sweep',
        speed:   0.3 + i * 0.15,
        offset:  i * Math.PI,
      });
    }

    // Bouncing hazard block (north corridor)
    const boxGeo = new THREE.BoxGeometry(2.5, 1.5, 2.5);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x440011,
      emissive: 0xff0022,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.5,
    });
    const bouncer = new THREE.Mesh(boxGeo, boxMat);
    bouncer.position.set(0, 1, -18);
    bouncer.castShadow = true;
    this.scene.add(bouncer);
    this._active.push({
      mesh:   bouncer,
      type:   'bounce',
      originX: 0,
      originZ: -18,
      range:   6,
      speed:   1.5,
      phase:   0,
    });
  }

  _buildSparkPool() {
    // Spark particle pool — triggered on hazard events
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
      m.visible = false;
      this.scene.add(m);
      this._sparks.push({ mesh: m, active: false, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  // ── Public API ────────────────────────────────────────────

  /** Spawn sparks at a world position */
  spawnSparks(x, y, z, count = 8, color = 0x00ff88) {
    let spawned = 0;
    for (const s of this._sparks) {
      if (s.active) continue;
      s.active = true;
      s.life   = 0.5 + Math.random() * 0.5;
      s.mesh.visible = true;
      s.mesh.position.set(x, y, z);
      s.mesh.material.color.set(color);
      const a  = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      s.vx = Math.cos(a) * sp;
      s.vy = 4 + Math.random() * 5;
      s.vz = Math.sin(a) * sp;
      spawned++;
      if (spawned >= count) break;
    }
  }

  /** Trigger meltdown visuals */
  startMeltdown() {
    this._meltdownActive = true;
    this._buildMeltdownFires();
  }

  _buildMeltdownFires() {
    // Animated fire particles at danger zones
    const fireMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    const firePositions = [
      [-20, 0, -20], [20, 0, -20], [-20, 0, 20], [20, 0, 20],
      [-30, 0, 0],   [30, 0, 0],   [0, 0, -30],  [0, 0, 30],
    ];

    firePositions.forEach(([fx, fy, fz]) => {
      for (let i = 0; i < 4; i++) {
        const geo  = new THREE.ConeGeometry(0.4 + Math.random() * 0.3, 1.5, 5);
        const fire = new THREE.Mesh(geo, fireMat.clone());
        fire.position.set(
          fx + (Math.random() - 0.5) * 2,
          fy + 0.75,
          fz + (Math.random() - 0.5) * 2
        );
        fire._phase  = Math.random() * Math.PI * 2;
        fire._speed  = 2 + Math.random() * 2;
        fire._baseY  = fire.position.y;
        this.scene.add(fire);
        this._fires.push(fire);
      }
    });
  }

  resetMeltdown() {
    this._meltdownActive = false;
    this._fires.forEach(f => this.scene.remove(f));
    this._fires = [];
  }

  // ── Per-frame update ─────────────────────────────────────
  update(dt, now) {
    const t = now * 0.001;

    // Sweep arms
    for (const h of this._active) {
      if (h.type === 'sweep') {
        h.mesh.rotation.z = t * h.speed + h.offset;
      } else if (h.type === 'bounce') {
        h.phase += dt * h.speed;
        h.mesh.position.x = h.originX + Math.sin(h.phase) * h.range;
      }
    }

    // Spark particles
    for (const s of this._sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life * 1.5;
    }

    // Meltdown fires
    if (this._meltdownActive) {
      for (const fire of this._fires) {
        fire.position.y = fire._baseY + Math.sin(t * fire._speed + fire._phase) * 0.3;
        fire.rotation.y = t * 2 + fire._phase;
        fire.material.opacity = 0.5 + Math.sin(t * fire._speed * 2 + fire._phase) * 0.3;
        const flicker = 0.8 + Math.sin(t * fire._speed * 3) * 0.2;
        fire.scale.setScalar(flicker);
      }
    }
  }

  /** Returns true if a position is inside any active moving hazard */
  checkHazardHit(x, y, z) {
    for (const h of this._active) {
      if (h.type === 'bounce') {
        const dx = x - h.mesh.position.x;
        const dz = z - h.mesh.position.z;
        const dy = y - h.mesh.position.y;
        if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5 && Math.abs(dy) < 1.5) return true;
      }
    }
    return false;
  }

  dispose() {
    this._fires.forEach(f => this.scene.remove(f));
    this._sparks.forEach(s => this.scene.remove(s.mesh));
    this._active.forEach(h => this.scene.remove(h.mesh));
  }
}
