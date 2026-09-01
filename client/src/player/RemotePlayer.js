// ============================================================
// GREED.exe - RemotePlayer
// Renders a remote player using interpolated snapshots.
// Visual richness scales with held bits (greed = visibility).
// ============================================================

import * as THREE from 'three';
import { EntityBuffer } from '../networking/Interpolation.js';
import { PLAYER_STATES } from '../../../shared/constants.js';

// Bit thresholds for visual intensity tiers
const TIER_LOW    = 50;
const TIER_MED    = 150;
const TIER_HIGH   = 350;
const TIER_INSANE = 600;

export class RemotePlayer {
  constructor(scene, playerData, effectsManager) {
    this.scene    = scene;
    this.id       = playerData.id;
    this.name     = playerData.name;
    this.effects  = effectsManager;

    this.heldBits    = playerData.held  || 0;
    this.bankedBits  = playerData.bankedBits || 0;
    this.isMostWanted = playerData.mw === 1;
    this.state        = playerData.state || PLAYER_STATES.ALIVE;
    this.upgrades     = playerData.upgrades || [];
    this.shielded     = playerData.sh === 1;

    this._buffer = new EntityBuffer();

    // Three.js objects
    this.mesh   = this._buildMesh();
    this._label = this._buildLabel();
    this._aura  = this._buildAura();
    this._light = new THREE.PointLight(0x00ff88, 1.0, 8);
    this._light.position.set(0, 1.2, 0);

    this.mesh.add(this._aura);
    this.mesh.add(this._light);
    this.scene.add(this.mesh);
    this.scene.add(this._label);

    // Crown / MW indicator
    this._crownMesh    = null;
    this._mwIndicator  = null;
    this._shieldSphere = null;

    this._trailTimer = 0;
    this._bobTimer   = 0;

    // Initialise position if provided
    if (playerData.x !== undefined) {
      this.mesh.position.set(playerData.x, playerData.y, playerData.z);
      this._label.position.set(playerData.x, playerData.y + 2.8, playerData.z);
    }

    this._applyMostWanted(this.isMostWanted);
  }

  // ── Mesh construction ────────────────────────────────────
  _buildMesh() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.7, 1.2, 0.7);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00cc77,
      emissive: 0x002211,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.35, 12, 8);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x00ee99,
      emissive: 0x003322,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR   = new THREE.Mesh(eyeGeo, eyeMat.clone());
    eyeL.position.set(-0.14, 1.6, 0.28);
    eyeR.position.set( 0.14, 1.6, 0.28);
    group.add(eyeL, eyeR);

    this._bodyMesh = body;
    this._headMesh = head;
    return group;
  }

  _buildAura() {
    const geo = new THREE.SphereGeometry(1.2, 16, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  _buildLabel() {
    // Canvas-based name label (billboard sprite)
    const canvas  = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx     = canvas.getContext('2d');

    ctx.font         = 'bold 28px "Courier New", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#00ff88';
    ctx.shadowColor  = '#00ff88';
    ctx.shadowBlur   = 12;
    ctx.fillText(this.name.slice(0, 14).toUpperCase(), 128, 32);

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1);
    this._labelCanvas  = canvas;
    this._labelCtx     = ctx;
    this._labelTex     = tex;
    this._labelMat     = mat;
    return sprite;
  }

  _rebuildLabel(color = '#00ff88') {
    const ctx = this._labelCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font         = 'bold 28px "Courier New", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = color;
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 18;
    ctx.fillText(this.name.slice(0, 14).toUpperCase(), 128, 32);
    this._labelTex.needsUpdate = true;
  }

  // ── Snapshot ingestion ───────────────────────────────────
  pushSnapshot(snap) {
    this._buffer.push({ ...snap, t: Date.now() });
    this.state = snap.state;
    this.heldBits = snap.held ?? this.heldBits;
    this.isMostWanted = snap.mw === 1;
    this.shielded = snap.sh === 1;
  }

  // ── Per-frame update ─────────────────────────────────────
  update(dt, now) {
    if (this.state === PLAYER_STATES.DEAD) {
      this.mesh.visible  = false;
      this._label.visible = false;
      return;
    }

    this.mesh.visible  = true;
    this._label.visible = true;

    // Interpolated position
    const renderT = this._buffer.getRenderTime();
    const s = this._buffer.sample(renderT);
    if (!s) return;

    this.mesh.position.set(s.x, s.y, s.z);
    this.mesh.rotation.y = s.yaw;
    this._label.position.set(s.x, s.y + 2.8, s.z);

    // Bob animation while alive
    this._bobTimer += dt * 3;
    this.mesh.position.y += Math.sin(this._bobTimer) * 0.03;

    // Update visuals for held bits
    this._updateVisuals(dt, now, s.held ?? this.heldBits);

    // Most Wanted state
    this._applyMostWanted(s.mw === 1);

    // Shield
    this._applyShield(s.sh === 1);
  }

  _updateVisuals(dt, now, heldBits) {
    const level = Math.min(1, heldBits / 500);

    // Body emissive
    const r = Math.min(1, level * 2);
    const g = 1 - level * 0.3;
    this._bodyMesh.material.emissive.setRGB(r * 0.3, g * 0.2, 0);
    this._bodyMesh.material.emissiveIntensity = 0.3 + level * 1.5;

    // Light
    this._light.intensity = 1.0 + level * 3.5;
    this._light.distance  = 8 + level * 14;
    this._light.color.setRGB(0.1 + level * 0.8, 1 - level * 0.5, 0.5 - level * 0.5);

    // Aura
    this._aura.material.opacity = level * 0.22;
    this._aura.scale.setScalar(1.0 + level * 1.5);
    this._aura.material.color.copy(this._light.color);

    // Label color
    if (heldBits >= TIER_INSANE) {
      this._rebuildLabel('#ff2244');
    } else if (heldBits >= TIER_HIGH) {
      this._rebuildLabel('#ff8800');
    } else if (heldBits >= TIER_MED) {
      this._rebuildLabel('#ffd700');
    } else {
      this._rebuildLabel('#00ff88');
    }

    // Trail
    if (heldBits > 150) {
      this._trailTimer += dt;
      if (this._trailTimer > 0.05) {
        this._trailTimer = 0;
        this.effects?.spawnTrail(this.mesh.position.clone(), heldBits);
      }
    }

    // Scale slightly with richness (intimidation factor)
    const scale = 1.0 + level * 0.25;
    this.mesh.scale.setScalar(scale);
  }

  _applyMostWanted(isMW) {
    if (isMW === this._wasMW) return;
    this._wasMW = isMW;

    if (isMW) {
      // Add crown
      if (!this._crownMesh) {
        this._crownMesh = _buildCrown();
        this._crownMesh.position.set(0, 2.1, 0);
        this.mesh.add(this._crownMesh);
      }
      // Pulse red aura
      this._aura.material.color.set(0xff2244);
      this._rebuildLabel('#ff2244');
    } else {
      if (this._crownMesh) {
        this.mesh.remove(this._crownMesh);
        this._crownMesh = null;
      }
      this._aura.material.color.set(0x00ff88);
    }
  }

  _applyShield(shielded) {
    if (shielded === this._wasShielded) return;
    this._wasShielded = shielded;

    if (shielded) {
      const geo = new THREE.SphereGeometry(1.4, 16, 10);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00eeff,
        transparent: true,
        opacity: 0.25,
        wireframe: false,
        side: THREE.DoubleSide,
      });
      this._shieldSphere = new THREE.Mesh(geo, mat);
      this._shieldSphere.position.y = 0.8;
      this.mesh.add(this._shieldSphere);
    } else if (this._shieldSphere) {
      this.mesh.remove(this._shieldSphere);
      this._shieldSphere = null;
    }
  }

  // ── Banking animation ─────────────────────────────────────
  showBanking(progress) {
    // Slight hover effect while banking
    if (progress > 0) {
      this.mesh.position.y += Math.sin(Date.now() * 0.015) * 0.04;
    }
  }

  // ── Crown (king) ─────────────────────────────────────────
  setKing(isKing) {
    if (isKing && !this._crownMesh) {
      this._crownMesh = _buildCrown();
      this._crownMesh.position.set(0, 2.1, 0);
      this.mesh.add(this._crownMesh);
    } else if (!isKing && this._crownMesh) {
      this.mesh.remove(this._crownMesh);
      this._crownMesh = null;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────
  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this._label);
    this._labelTex.dispose();
    this._buffer.clear();
  }
}

// ── Crown helper ──────────────────────────────────────────────
function _buildCrown() {
  const group = new THREE.Group();
  const mat   = new THREE.MeshBasicMaterial({ color: 0xffd700 });
  const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 6), mat);
  group.add(base);

  const heights = [0.22, 0.32, 0.22, 0.18, 0.32, 0.18];
  for (let i = 0; i < 6; i++) {
    const sg = new THREE.Mesh(new THREE.ConeGeometry(0.07, heights[i], 4), mat);
    const a  = (i / 6) * Math.PI * 2;
    sg.position.set(Math.cos(a) * 0.22, 0.06 + heights[i] / 2, Math.sin(a) * 0.22);
    group.add(sg);
  }
  return group;
}
