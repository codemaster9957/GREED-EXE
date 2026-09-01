// ============================================================
// GREED.exe - Arena
// One polished arena with:
//   • main floor + walls
//   • elevated center platform (high-risk / high-reward)
//   • side platforms at varying heights
//   • bank terminals (5 locations)
//   • jump pads
//   • pit zones
//   • collapsible platforms (meltdown)
//   • environmental lighting + meltdown FX
// ============================================================

import * as THREE from 'three';
import { BANK_POSITIONS } from '../../../shared/constants.js';

// Materials palette (reused across geometry)
const MAT = {
  floor:       null,
  wall:        null,
  platform:    null,
  centerPlat:  null,
  danger:      null,
  bankTerminal: null,
  bankGlow:    null,
  jumpPad:     null,
  emissive:    null,
};

function _initMaterials() {
  MAT.floor = new THREE.MeshStandardMaterial({
    color: 0x0a1a0f,
    roughness: 0.85,
    metalness: 0.1,
  });
  MAT.wall = new THREE.MeshStandardMaterial({
    color: 0x061410,
    roughness: 0.9,
    metalness: 0.05,
    side: THREE.BackSide,
  });
  MAT.platform = new THREE.MeshStandardMaterial({
    color: 0x0d2218,
    roughness: 0.6,
    metalness: 0.3,
    emissive: 0x001a08,
    emissiveIntensity: 0.3,
  });
  MAT.centerPlat = new THREE.MeshStandardMaterial({
    color: 0x1a2d10,
    roughness: 0.4,
    metalness: 0.5,
    emissive: 0x0a1808,
    emissiveIntensity: 0.5,
  });
  MAT.danger = new THREE.MeshStandardMaterial({
    color: 0x220a00,
    roughness: 0.7,
    metalness: 0.2,
    emissive: 0xff2200,
    emissiveIntensity: 0.15,
  });
  MAT.bankTerminal = new THREE.MeshStandardMaterial({
    color: 0x002a15,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x00ff88,
    emissiveIntensity: 0.4,
  });
  MAT.bankGlow = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  MAT.jumpPad = new THREE.MeshStandardMaterial({
    color: 0x002255,
    roughness: 0.2,
    metalness: 0.9,
    emissive: 0x0044ff,
    emissiveIntensity: 0.6,
  });
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Collapsible platform refs (by index)
    this._collapsiblePlatforms = {};
    // Bank terminal meshes (by index)
    this._bankTerminals = [];
    // Closed bank set
    this._closedBanks = new Set();
    // Jump pads
    this._jumpPads = [];
    // Ambient lights
    this._meltdownLights = [];

    _initMaterials();
    this._build();
    this._buildLighting();
  }

  // ── Build ─────────────────────────────────────────────────
  _build() {
    this._buildFloor();
    this._buildWalls();
    this._buildCenterPlatform();
    this._buildSidePlatforms();
    this._buildBridges();
    this._buildBankTerminals();
    this._buildJumpPads();
    this._buildPitStrips();
    this._buildDecor();
  }

  _buildFloor() {
    // Main floor (40×40 units, grid-lined)
    const geo  = new THREE.BoxGeometry(80, 0.5, 80);
    const mesh = new THREE.Mesh(geo, MAT.floor);
    mesh.position.set(0, -0.25, 0);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Grid lines (emissive strips baked into geometry as thin boxes)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.07 });
    for (let i = -36; i <= 36; i += 8) {
      const hLine = new THREE.Mesh(new THREE.BoxGeometry(80, 0.02, 0.06), lineMat);
      hLine.position.set(0, 0.01, i);
      this.group.add(hLine);
      const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 80), lineMat);
      vLine.position.set(i, 0.01, 0);
      this.group.add(vLine);
    }
  }

  _buildWalls() {
    // Invisible kill walls at arena edge (no mesh, handled server-side)
    // Visible barrier trim — low emissive strips
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.25 });
    const trimH   = 0.15;
    const halfW   = 40;

    [
      { pos: [0, trimH / 2, -halfW], rot: [0, 0, 0],         size: [halfW * 2, trimH, 0.2] },
      { pos: [0, trimH / 2,  halfW], rot: [0, Math.PI, 0],   size: [halfW * 2, trimH, 0.2] },
      { pos: [-halfW, trimH / 2, 0], rot: [0, Math.PI / 2, 0], size: [halfW * 2, trimH, 0.2] },
      { pos: [ halfW, trimH / 2, 0], rot: [0, -Math.PI / 2, 0], size: [halfW * 2, trimH, 0.2] },
    ].forEach(({ pos, size }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), trimMat);
      m.position.set(...pos);
      this.group.add(m);
    });
  }

  _buildCenterPlatform() {
    // Elevated octagonal center — highest risk / highest reward
    const geo  = new THREE.CylinderGeometry(9, 9, 1.0, 8);
    const mesh = new THREE.Mesh(geo, MAT.centerPlat);
    mesh.position.set(0, 3.5, 0);
    mesh.receiveShadow = true;
    mesh.castShadow    = true;
    this.group.add(mesh);

    // Glowing ring underneath
    const ringGeo = new THREE.TorusGeometry(9.2, 0.15, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 3.0, 0);
    this.group.add(ring);

    // Ramps up to center platform (4 cardinal directions)
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x0a1a10, roughness: 0.7, metalness: 0.2 });
    const rampDefs = [
      { x:  0, z: -12, ry: 0 },
      { x:  0, z:  12, ry: Math.PI },
      { x: -12, z: 0, ry: Math.PI / 2 },
      { x:  12, z: 0, ry: -Math.PI / 2 },
    ];
    rampDefs.forEach(({ x, z, ry }) => {
      const rampGeo  = new THREE.BoxGeometry(4, 0.25, 5);
      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.position.set(x, 1.6, z);
      rampMesh.rotation.y = ry;
      // Tilt toward center
      const tiltAxis = new THREE.Vector3(Math.cos(ry + Math.PI / 2), 0, Math.sin(ry + Math.PI / 2));
      const angle = Math.atan2(3.5, 3);
      rampMesh.rotateOnWorldAxis(tiltAxis, ry === 0 || ry === Math.PI ? angle : -angle);
      this.group.add(rampMesh);
    });
  }

  _buildSidePlatforms() {
    // 8 side platforms at medium height — also have collapse triggers
    const platDefs = [
      { id: 2,  x: -20, y: 2.5, z: -20, w: 8, d: 8,  collapsible: true },
      { id: 5,  x:  20, y: 2.5, z: -20, w: 8, d: 8,  collapsible: true },
      { id: 7,  x: -20, y: 2.5, z:  20, w: 8, d: 8,  collapsible: true },
      { id: 11, x:  20, y: 2.5, z:  20, w: 8, d: 8,  collapsible: true },
      { id: 1,  x: -30, y: 1.5, z:   0, w: 6, d: 10, collapsible: false },
      { id: 3,  x:  30, y: 1.5, z:   0, w: 6, d: 10, collapsible: false },
      { id: 4,  x:   0, y: 1.5, z: -30, w: 10, d: 6, collapsible: false },
      { id: 14, x:   0, y: 1.5, z:  30, w: 10, d: 6, collapsible: true },
      { id: 6,  x: -14, y: 3.5, z:   0, w: 5, d: 5,  collapsible: false },
      { id: 8,  x:  14, y: 3.5, z:   0, w: 5, d: 5,  collapsible: false },
    ];

    platDefs.forEach(({ id, x, y, z, w, d, collapsible }) => {
      const geo  = new THREE.BoxGeometry(w, 0.6, d);
      const mesh = new THREE.Mesh(geo, collapsible ? MAT.danger : MAT.platform);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow    = true;
      this.group.add(mesh);

      if (collapsible) {
        this._collapsiblePlatforms[id] = mesh;
        // Collapse warning stripe
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.3 });
        const stripe     = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), stripeMat);
        stripe.position.set(x, y + 0.32, z);
        this.group.add(stripe);
      }
    });
  }

  _buildBridges() {
    // Narrow connecting bridges — dangerous for knockback
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x081a10, roughness: 0.6, metalness: 0.4,
      emissive: 0x001a08, emissiveIntensity: 0.2,
    });
    const bridges = [
      { x:  0, y: 0.3, z: -18, w: 3, d: 12 }, // north path to center
      { x:  0, y: 0.3, z:  18, w: 3, d: 12 }, // south
      { x: -18, y: 0.3, z: 0,  w: 12, d: 3 }, // west
      { x:  18, y: 0.3, z: 0,  w: 12, d: 3 }, // east
      { x: -10, y: 0.3, z: -10, w: 2.5, d: 2.5 }, // diagonal shortcuts (risky)
      { x:  10, y: 0.3, z: -10, w: 2.5, d: 2.5 },
      { x: -10, y: 0.3, z:  10, w: 2.5, d: 2.5 },
      { x:  10, y: 0.3, z:  10, w: 2.5, d: 2.5 },
    ];
    bridges.forEach(({ x, y, z, w, d }) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), bridgeMat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  _buildBankTerminals() {
    BANK_POSITIONS.forEach((pos, i) => {
      const terminal = this._buildSingleTerminal(i, pos);
      this._bankTerminals.push({ group: terminal, pos, index: i, open: true });
    });
  }

  _buildSingleTerminal(index, pos) {
    const group = new THREE.Group();

    // Main terminal box
    const geo  = new THREE.BoxGeometry(1.8, 2.2, 1.0);
    const mesh = new THREE.Mesh(geo, MAT.bankTerminal.clone());
    mesh.castShadow = true;
    group.add(mesh);

    // Screen face (emissive)
    const screenGeo = new THREE.PlaneGeometry(1.2, 0.8);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.2, 0.52);
    group.add(screen);

    // BANK label (canvas texture)
    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 128;
    const ctx     = canvas.getContext('2d');
    ctx.fillStyle = '#001a0c';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 40px "Courier New"';
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'center';
    ctx.fillText('BANK', 128, 55);
    ctx.font = 'bold 22px "Courier New"';
    ctx.fillStyle = '#00cc66';
    ctx.fillText(`TERMINAL ${index + 1}`, 128, 90);
    const tex = new THREE.CanvasTexture(canvas);
    screen.material.map = tex;
    screen.material.needsUpdate = true;

    // Glow zone (transparent cylinder on floor)
    const glowGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.05, 32);
    const glow    = new THREE.Mesh(glowGeo, MAT.bankGlow.clone());
    glow.position.y = -1.1;
    group.add(glow);

    // Point light
    const light = new THREE.PointLight(0x00ff88, 1.2, 10);
    light.position.set(0, 1, 0);
    group.add(light);

    // Orbit ring
    const ringGeo = new THREE.TorusGeometry(2.2, 0.06, 6, 32);
    const ring    = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.8;
    group.add(ring);
    this[`_bankRing${index}`] = ring; // store for animation

    group.position.set(pos.x, pos.y, pos.z);
    this.group.add(group);
    return group;
  }

  _buildJumpPads() {
    const padDefs = [
      { x: -22, z: -22 },
      { x:  22, z: -22 },
      { x: -22, z:  22 },
      { x:  22, z:  22 },
      { x:   0, z:   0 }, // center (accessible from elevated platform)
    ];

    padDefs.forEach(({ x, z }) => {
      const geo  = new THREE.CylinderGeometry(1.2, 1.2, 0.18, 12);
      const mesh = new THREE.Mesh(geo, MAT.jumpPad);
      mesh.position.set(x, 0.09, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // Arrow indicator
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.7 });
      const arrow    = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 6), arrowMat);
      arrow.position.set(x, 0.7, z);
      this.group.add(arrow);

      this._jumpPads.push({ x, z, mesh });
    });
  }

  _buildPitStrips() {
    // Visual pit hazard strips between platforms (darker floor)
    const pitMat = new THREE.MeshBasicMaterial({ color: 0xff1100, transparent: true, opacity: 0.08 });
    const pits = [
      { x:  0, z: -35, w: 80, d: 10 },
      { x:  0, z:  35, w: 80, d: 10 },
      { x: -35, z: 0, w: 10, d: 80 },
      { x:  35, z: 0, w: 10, d: 80 },
    ];
    pits.forEach(({ x, z, w, d }) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pitMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      this.group.add(m);
    });

    // Warning text at pit edges
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.5 });
    for (let i = -32; i <= 32; i += 8) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), warnMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(i, 0.02, -38);
      this.group.add(dot.clone());
      dot.position.set(i, 0.02,  38);
      this.group.add(dot.clone());
      dot.position.set(-38, 0.02, i);
      this.group.add(dot.clone());
      dot.position.set( 38, 0.02, i);
      this.group.add(dot);
    }
  }

  _buildDecor() {
    // Scattered glowing pillars for visual interest + knockback blockers
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x061a0d, roughness: 0.4, metalness: 0.6,
      emissive: 0x003311, emissiveIntensity: 0.3,
    });
    const pillars = [
      [-8,  0, -8], [ 8,  0, -8],
      [-8,  0,  8], [ 8,  0,  8],
      [-24, 0, -8], [24, 0,  -8],
      [-24, 0,  8], [24, 0,   8],
    ];
    pillars.forEach(([x, y, z]) => {
      const geo  = new THREE.CylinderGeometry(0.4, 0.4, 4, 6);
      const mesh = new THREE.Mesh(geo, pillarMat);
      mesh.position.set(x, 2, z);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // Glowing top cap
      const capMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
      const cap    = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), capMat);
      cap.position.set(x, 4.2, z);
      this.group.add(cap);
    });
  }

  _buildLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x112211, 0.6);
    this.scene.add(ambient);

    // Main directional (simulated sun)
    const dir = new THREE.DirectionalLight(0x88ffaa, 0.8);
    dir.position.set(20, 40, 20);
    dir.castShadow             = true;
    dir.shadow.mapSize.width   = 1024;
    dir.shadow.mapSize.height  = 1024;
    dir.shadow.camera.near     = 0.5;
    dir.shadow.camera.far      = 150;
    dir.shadow.camera.left     = -55;
    dir.shadow.camera.right    =  55;
    dir.shadow.camera.top      =  55;
    dir.shadow.camera.bottom   = -55;
    this.scene.add(dir);
    this._dirLight = dir;

    // Accent lights at each corner
    const corners = [[-30, 8, -30], [30, 8, -30], [-30, 8, 30], [30, 8, 30]];
    corners.forEach(([x, y, z], i) => {
      const colors = [0x00ff88, 0xffd700, 0x00eeff, 0xff2244];
      const l = new THREE.PointLight(colors[i], 0.4, 35);
      l.position.set(x, y, z);
      this.scene.add(l);
    });

    // Meltdown warning lights (off by default)
    const meltPositions = [[-20, 4, -20], [20, 4, -20], [-20, 4, 20], [20, 4, 20], [0, 6, 0]];
    meltPositions.forEach(([x, y, z]) => {
      const l = new THREE.PointLight(0xff2200, 0, 20);
      l.position.set(x, y, z);
      this.scene.add(l);
      this._meltdownLights.push(l);
    });
  }

  // ── Public API ────────────────────────────────────────────

  /** Collapse a platform by server-broadcast index */
  collapsePlatform(platformId) {
    const mesh = this._collapsiblePlatforms[platformId];
    if (!mesh) return;

    // Animate drop
    let elapsed = 0;
    const startY = mesh.position.y;
    const drop = () => {
      elapsed += 0.016;
      mesh.position.y = startY - elapsed * 8;
      mesh.material.emissiveIntensity = Math.max(0, 0.3 - elapsed * 0.5);
      mesh.material.opacity = Math.max(0, 1 - elapsed * 0.8);
      mesh.material.transparent = true;
      if (elapsed < 1.5) requestAnimationFrame(drop);
      else this.group.remove(mesh);
    };
    drop();
  }

  /** Close a bank terminal visually */
  closeBank(zoneIndex) {
    this._closedBanks.add(zoneIndex);
    const terminal = this._bankTerminals[zoneIndex];
    if (!terminal) return;
    // Red tint, shut sign
    terminal.group.children.forEach(c => {
      if (c.material?.emissive) {
        c.material.emissive.set(0xff0000);
        c.material.emissiveIntensity = 0.3;
      }
    });
  }

  /** Activate meltdown environment */
  startMeltdown() {
    this._meltdownLights.forEach(l => { l.intensity = 1.2; });
    if (this._dirLight) {
      this._dirLight.color.set(0xff4400);
      this._dirLight.intensity = 0.5;
    }
  }

  /** Reset environment after results */
  resetEnvironment() {
    this._meltdownLights.forEach(l => { l.intensity = 0; });
    if (this._dirLight) {
      this._dirLight.color.set(0x88ffaa);
      this._dirLight.intensity = 0.8;
    }
    this._closedBanks.clear();
  }

  /** Per-frame update — animates bank rings, jump pad pulses */
  update(dt, now) {
    const t = now * 0.001;

    // Spin bank rings
    for (let i = 0; i < BANK_POSITIONS.length; i++) {
      const ring = this[`_bankRing${i}`];
      if (ring && !this._closedBanks.has(i)) {
        ring.rotation.z = t * 0.8 + i * 1.2;
      }
    }

    // Pulse jump pad arrows
    this._jumpPads.forEach((pad, i) => {
      pad.mesh.material.emissiveIntensity = 0.4 + Math.sin(t * 2 + i) * 0.3;
    });
  }

  /** Is position inside a bank zone? Returns index or -1 */
  getBankZoneAt(x, z, radius) {
    for (let i = 0; i < BANK_POSITIONS.length; i++) {
      if (this._closedBanks.has(i)) continue;
      const bp = BANK_POSITIONS[i];
      const dx = x - bp.x, dz = z - bp.z;
      if (Math.sqrt(dx * dx + dz * dz) <= radius) return i;
    }
    return -1;
  }

  /** Check if position is on a jump pad */
  getJumpPadAt(x, z) {
    for (const pad of this._jumpPads) {
      const dx = x - pad.x, dz = z - pad.z;
      if (Math.sqrt(dx * dx + dz * dz) < 1.5) return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
