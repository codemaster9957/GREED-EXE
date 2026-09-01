// ============================================================
// GREED.exe - BitRenderer
// Renders BITs using InstancedMesh for performance.
// Supports up to MAX_BITS instances.
// BITs pulse, spin, and float — cheap and satisfying.
// ============================================================

import * as THREE from 'three';
import { GAME_CONFIG } from '../../../shared/constants.js';

const MAX_BITS = GAME_CONFIG.MAX_BITS_IN_WORLD;
const _dummy   = new THREE.Object3D();

export class BitRenderer {
  constructor(scene) {
    this.scene = scene;

    // bitId → { id, x, y, z, value, phase (random float) }
    this._bits       = new Map();
    this._dirtyCount = 0;

    // Build instanced mesh
    this._buildInstances();
    this._buildCollectEffect();
  }

  // ── Instanced mesh ────────────────────────────────────────
  _buildInstances() {
    // Octahedron — iconic "gem" shape
    const geo = new THREE.OctahedronGeometry(0.22, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.6,
      transparent: true,
      opacity: 0.95,
    });

    this._mesh = new THREE.InstancedMesh(geo, mat, MAX_BITS);
    this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._mesh.castShadow = false;
    this._mesh.count = 0;

    // Per-instance color (value tier: green → gold → white)
    this._colors = new Float32Array(MAX_BITS * 3);
    this._mesh.instanceColor = new THREE.InstancedBufferAttribute(this._colors, 3);

    this.scene.add(this._mesh);

    // Inner glow geometry (slightly larger, emissive-only, additive)
    const glowGeo = new THREE.OctahedronGeometry(0.32, 0);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    this._glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, MAX_BITS);
    this._glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._glowMesh.count = 0;
    this.scene.add(this._glowMesh);
  }

  _buildCollectEffect() {
    // Pool of small burst sprites for collection events
    this._burstPool = [];
    const burstGeo  = new THREE.SphereGeometry(0.15, 6, 4);
    const burstMat  = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(burstGeo, burstMat.clone());
      m.visible = false;
      this.scene.add(m);
      this._burstPool.push({ mesh: m, active: false, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  // ── Public API ────────────────────────────────────────────

  addBit(bit) {
    if (this._bits.has(bit.id)) return;
    this._bits.set(bit.id, {
      ...bit,
      phase: Math.random() * Math.PI * 2,  // random float offset for bob
    });
    this._dirtyCount++;
  }

  removeBit(bitId) {
    this._bits.delete(bitId);
    this._dirtyCount++;
  }

  addBits(bits) {
    bits.forEach(b => this.addBit(b));
  }

  clearAll() {
    this._bits.clear();
    this._mesh.count = 0;
    this._glowMesh.count = 0;
  }

  /** Spawn a burst effect at a position (collection feedback) */
  spawnCollectBurst(x, y, z, value) {
    const count = Math.min(6, Math.ceil(value / 3) + 2);
    let spawned = 0;

    for (const p of this._burstPool) {
      if (p.active) continue;
      p.active = true;
      p.life   = 1.0;
      p.mesh.visible = true;
      p.mesh.position.set(x, y + 0.3, z);
      p.mesh.scale.setScalar(1);

      const a  = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 4;
      p.vx = Math.cos(a) * sp;
      p.vy = 4 + Math.random() * 3;
      p.vz = Math.sin(a) * sp;

      // Color by value
      if (value >= 10) {
        p.mesh.material.color.set(0xffd700);
      } else if (value >= 5) {
        p.mesh.material.color.set(0x88ff44);
      } else {
        p.mesh.material.color.set(0x00ff88);
      }

      spawned++;
      if (spawned >= count) break;
    }
  }

  /** Large scatter burst (death drops) */
  spawnDeathBurst(x, y, z, amount) {
    const count = Math.min(16, Math.ceil(amount / 20) + 4);
    let spawned = 0;

    for (const p of this._burstPool) {
      if (p.active) continue;
      p.active = true;
      p.life   = 1.5;
      p.mesh.visible = true;
      p.mesh.position.set(x, y + 0.5, z);
      p.mesh.scale.setScalar(1.5);

      const a  = Math.random() * Math.PI * 2;
      const sp = 5 + Math.random() * 8;
      p.vx = Math.cos(a) * sp;
      p.vy = 6 + Math.random() * 5;
      p.vz = Math.sin(a) * sp;
      p.mesh.material.color.set(0xffd700);

      spawned++;
      if (spawned >= count) break;
    }
  }

  // ── Per-frame update ─────────────────────────────────────
  update(dt, now) {
    const t = now * 0.001;

    // Rebuild instance matrices every frame (bits are animated)
    let idx = 0;
    for (const bit of this._bits.values()) {
      if (idx >= MAX_BITS) break;

      // Float + spin
      const bobY  = bit.y + Math.sin(t * 2.4 + bit.phase) * 0.12 + 0.3;
      const rot   = t * 1.8 + bit.phase;

      _dummy.position.set(bit.x, bobY, bit.z);
      _dummy.rotation.y = rot;
      _dummy.rotation.x = rot * 0.4;
      _dummy.scale.setScalar(1.0 + Math.sin(t * 3 + bit.phase) * 0.07);
      _dummy.updateMatrix();

      this._mesh.setMatrixAt(idx, _dummy.matrix);
      this._glowMesh.setMatrixAt(idx, _dummy.matrix);

      // Color by value tier
      const v = bit.value;
      if (v >= 12) {
        this._colors[idx * 3]     = 1.0;
        this._colors[idx * 3 + 1] = 1.0;
        this._colors[idx * 3 + 2] = 1.0; // white = max value
      } else if (v >= 6) {
        this._colors[idx * 3]     = 1.0;
        this._colors[idx * 3 + 1] = 0.84;
        this._colors[idx * 3 + 2] = 0.0; // gold
      } else {
        this._colors[idx * 3]     = 0.0;
        this._colors[idx * 3 + 1] = 1.0;
        this._colors[idx * 3 + 2] = 0.53; // green
      }

      idx++;
    }

    this._mesh.count     = idx;
    this._glowMesh.count = idx;

    if (idx > 0) {
      this._mesh.instanceMatrix.needsUpdate = true;
      this._mesh.instanceColor.needsUpdate  = true;
      this._glowMesh.instanceMatrix.needsUpdate = true;
    }

    // Update burst particles
    for (const p of this._burstPool) {
      if (!p.active) continue;
      p.life -= dt * 1.8;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 12 * dt; // gravity
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(p.life * 1.2);
      p.mesh.material.opacity = p.life * 0.9;
      p.mesh.rotation.x += 5 * dt;
      p.mesh.rotation.z += 3 * dt;
    }
  }

  dispose() {
    this.scene.remove(this._mesh);
    this.scene.remove(this._glowMesh);
    this._burstPool.forEach(p => this.scene.remove(p.mesh));
  }
}
