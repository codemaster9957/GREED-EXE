// ============================================================
// GREED.exe - PlayerController
// Local player: input, client-side prediction, camera, attack
// ============================================================

import * as THREE from 'three';
import { GAME_CONFIG, PLAYER_STATES, BANK_POSITIONS } from '../../../shared/constants.js';
import { MSG } from '../../../shared/messages.js';

const _v3   = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

// How sensitive mouse look is
const MOUSE_SENSITIVITY = 0.0018;
// Camera boom settings
const CAM_DISTANCE = 12;
const CAM_HEIGHT   = 7;
const CAM_PITCH_MIN = -0.4;
const CAM_PITCH_MAX =  1.1;

export class PlayerController {
  constructor(scene, camera, network, effectsManager, audioManager) {
    this.scene    = scene;
    this.camera   = camera;
    this.network  = network;
    this.effects  = effectsManager;
    this.audio    = audioManager;

    // State
    this.playerId  = null;
    this.state     = PLAYER_STATES.ALIVE;
    this.heldBits  = 0;
    this.bankedBits = 0;
    this.upgrades  = [];
    this.isBanking = false;
    this.bankProgress = 0;
    this.shielded  = false;

    // Local physics (prediction)
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw   = 0;   // horizontal look (radians)
    this.pitch = 0.3; // vertical look (radians)

    // Camera pivot object for smooth follow
    this._camTarget = new THREE.Vector3();

    // Input state
    this._keys = {
      w: false, a: false, s: false, d: false,
      space: false, shift: false, dash: false,
    };
    this._dashPressed    = false;
    this._attackPressed  = false;
    this._lastAttack     = 0;
    this._lastDash       = 0;
    this._dashCooldown   = GAME_CONFIG.DASH_COOLDOWN;
    this._attackCooldown = GAME_CONFIG.ATTACK_COOLDOWN;

    // Mouse look
    this._mouseDX = 0;
    this._mouseDY = 0;
    this._pointerLocked = false;

    // Three.js mesh
    this.mesh = this._buildMesh();
    this.scene.add(this.mesh);

    // Crown (king visual)
    this._crownMesh = null;
    this._isKing    = false;

    // Aura glow (scales with held bits)
    this._aura = this._buildAura();
    this.mesh.add(this._aura);

    // Trail particles
    this._trailParticles = [];
    this._trailTimer     = 0;

    // Landing feedback
    this._wasGrounded = true;
    this._landingShake = 0;

    // Camera shake
    this._shakeAmount = 0;
    this._shakeDecay  = 0.85;

    this._bindInput();

    // Network: server corrects position on authoritative snapshots
    this._serverPos = null;
    this._serverVel = null;
    this._lastInputSeq = 0;
    this._sentInputTime = 0;
    this._inputRate = 1000 / GAME_CONFIG.SERVER_TICK_RATE;

    // Bank zone proximity
    this._nearBankIndex = -1;
    this._bankCheckTimer = 0;
  }

  // ── Mesh construction ────────────────────────────────────
  _buildMesh() {
    const group = new THREE.Group();

    // Body — capsule-ish from box + sphere
    const bodyGeo  = new THREE.BoxGeometry(0.7, 1.2, 0.7);
    const bodyMat  = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x003322,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 12, 8);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: 0x004422,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Eye glow
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR   = new THREE.Mesh(eyeGeo, eyeMat.clone());
    eyeL.position.set(-0.14, 1.6, 0.28);
    eyeR.position.set( 0.14, 1.6, 0.28);
    group.add(eyeL, eyeR);

    // Point light attached to player (scales with held bits)
    const light = new THREE.PointLight(0x00ff88, 1.5, 8);
    light.position.set(0, 1.2, 0);
    group.add(light);
    this._playerLight = light;

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

  // ── Input binding ────────────────────────────────────────
  _bindInput() {
    // Keyboard
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup',   (e) => this._onKeyUp(e));

    // Pointer lock for mouse look
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === document.getElementById('game-canvas');
    });
    document.getElementById('game-canvas')?.addEventListener('click', () => {
      if (!this._pointerLocked && this.state === PLAYER_STATES.ALIVE) {
        document.getElementById('game-canvas').requestPointerLock();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this._pointerLocked) return;
      this._mouseDX += e.movementX;
      this._mouseDY += e.movementY;
    });

    // Attack on click
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._attackPressed = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._attackPressed = false;
    });
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this._keys.w     = true; break;
      case 'KeyS': case 'ArrowDown':  this._keys.s     = true; break;
      case 'KeyA': case 'ArrowLeft':  this._keys.a     = true; break;
      case 'KeyD': case 'ArrowRight': this._keys.d     = true; break;
      case 'Space': e.preventDefault(); this._keys.space = true; break;
      case 'ShiftLeft': case 'ShiftRight': this._keys.shift = true; break;
      case 'KeyF': case 'KeyQ':       // dash on F or Q
        if (!this._dashPressed) { this._dashPressed = true; this._keys.dash = true; }
        break;
      case 'Escape':
        if (this._pointerLocked) document.exitPointerLock();
        break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this._keys.w     = false; break;
      case 'KeyS': case 'ArrowDown':  this._keys.s     = false; break;
      case 'KeyA': case 'ArrowLeft':  this._keys.a     = false; break;
      case 'KeyD': case 'ArrowRight': this._keys.d     = false; break;
      case 'Space':                   this._keys.space = false; break;
      case 'ShiftLeft': case 'ShiftRight': this._keys.shift = false; break;
      case 'KeyF': case 'KeyQ':
        this._dashPressed = false;
        this._keys.dash   = false;
        break;
    }
  }

  // ── Public API ────────────────────────────────────────────

  setPlayerId(id)      { this.playerId = id; }
  setPosition(x, y, z) { this.pos.set(x, y, z); this.mesh.position.copy(this.pos); }
  setUpgrades(list)    { this.upgrades = list; }

  applyKnockback(kx, ky, kz) {
    this.vel.x += kx;
    this.vel.y += ky;
    this.vel.z += kz;
    this.addCameraShake(0.35);
    this.audio?.play('hit_received');
  }

  addCameraShake(amount) {
    this._shakeAmount = Math.max(this._shakeAmount, amount);
  }

  setKing(isKing) {
    this._isKing = isKing;
    if (isKing && !this._crownMesh) {
      this._crownMesh = _buildCrown();
      this._crownMesh.position.set(0, 2.1, 0);
      this.mesh.add(this._crownMesh);
    } else if (!isKing && this._crownMesh) {
      this.mesh.remove(this._crownMesh);
      this._crownMesh = null;
    }
  }

  die()     { this.state = PLAYER_STATES.DEAD;  this.mesh.visible = false; }
  respawn() { this.state = PLAYER_STATES.ALIVE; this.mesh.visible = true;  }

  // ── Per-frame update ─────────────────────────────────────
  update(dt, now) {
    if (this.state === PLAYER_STATES.DEAD) {
      this._updateCamera(dt);
      return;
    }

    // ── Mouse look ──────────────────────────────────────
    this.yaw   -= this._mouseDX * MOUSE_SENSITIVITY;
    this.pitch -= this._mouseDY * MOUSE_SENSITIVITY;
    this.pitch  = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, this.pitch));
    this._mouseDX = 0;
    this._mouseDY = 0;

    // ── Input → movement ────────────────────────────────
    const k = this._keys;
    let moveX = 0, moveZ = 0;
    if (k.w) moveZ -= 1;
    if (k.s) moveZ += 1;
    if (k.a) moveX -= 1;
    if (k.d) moveX += 1;

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    // Rotate to world space by yaw
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wx = moveX * cy - moveZ * sy;
    const wz = moveX * sy + moveZ * cy;

    const speed     = this._getMoveSpeed();
    const isSprint  = k.shift;
    const finalSpd  = isSprint ? speed * GAME_CONFIG.SPRINT_MULTIPLIER : speed;
    const isGrounded = this.pos.y <= 0.05;
    const accel     = isGrounded ? 50 : 50 * GAME_CONFIG.AIR_CONTROL;

    this.vel.x += (wx * finalSpd - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * finalSpd - this.vel.z) * Math.min(1, accel * dt);

    if (len === 0) {
      const friction = Math.pow(GAME_CONFIG.FRICTION, dt * 60);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    // Jump
    if (k.space && isGrounded) {
      this.vel.y = this._getJumpForce();
      this.audio?.play('jump');
    }

    // Dash
    if (k.dash && now - this._lastDash > this._getDashCooldown()) {
      this._lastDash = now;
      this._keys.dash = false;
      this._dashPressed = false;
      const dir = len > 0 ? { x: wx, z: wz } : { x: Math.cos(this.yaw), z: Math.sin(this.yaw) };
      this.vel.x = dir.x * GAME_CONFIG.DASH_SPEED;
      this.vel.z = dir.z * GAME_CONFIG.DASH_SPEED;
      this.effects?.spawnDash(this.pos, this.yaw);
      this.audio?.play('dash');
    }

    // Gravity
    this.vel.y += GAME_CONFIG.GRAVITY * dt;

    // Integrate
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // Landing feedback
    if (isGrounded && !this._wasGrounded && this.vel.y < -3) {
      this._landingShake = 0.12;
      this.audio?.play('land');
      this.effects?.spawnLand(this.pos);
    }
    this._wasGrounded = isGrounded;

    // Ground clamp
    if (this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; }

    // Arena bounds
    this.pos.x = Math.max(-GAME_CONFIG.ARENA_HALF_WIDTH,  Math.min(GAME_CONFIG.ARENA_HALF_WIDTH,  this.pos.x));
    this.pos.z = Math.max(-GAME_CONFIG.ARENA_HALF_DEPTH, Math.min(GAME_CONFIG.ARENA_HALF_DEPTH, this.pos.z));

    // Sync mesh
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    // ── Attack ──────────────────────────────────────────
    if (this._attackPressed && now - this._lastAttack > this._attackCooldown) {
      this._lastAttack = now;
      this._sendAttack();
      this.addCameraShake(0.12);
      this.effects?.spawnAttackSwing(this.pos, this.yaw);
      this.audio?.play('attack_swing');
    }

    // ── Send input to server ─────────────────────────────
    if (now - this._sentInputTime > this._inputRate) {
      this._sentInputTime = now;
      this._sendInput();
    }

    // ── Bank zone check ──────────────────────────────────
    this._bankCheckTimer += dt;
    if (this._bankCheckTimer > 0.15) {
      this._bankCheckTimer = 0;
      this._checkBankZone();
    }

    // ── Visual: aura + glow ─────────────────────────────
    this._updateVisuals(dt, now);

    // ── Camera ──────────────────────────────────────────
    this._updateCamera(dt);
  }

  // ── Visuals ───────────────────────────────────────────────
  _updateVisuals(dt, now) {
    const held  = this.heldBits;
    const level = Math.min(1, held / 500);

    // Body emissive color shifts from green → gold → red at extremes
    const r = Math.min(1, level * 2);
    const g = 1 - level * 0.3;
    const b = 0;
    this._bodyMesh.material.emissive.setRGB(r * 0.3, g * 0.2, b);
    this._bodyMesh.material.emissiveIntensity = 0.4 + level * 1.5;

    // Player point light
    const lIntensity = 1.5 + level * 4;
    const lColor = new THREE.Color().setRGB(
      0.1 + level * 0.8,
      1 - level * 0.5,
      0.5 - level * 0.5
    );
    this._playerLight.intensity = lIntensity;
    this._playerLight.color.copy(lColor);
    this._playerLight.distance = 8 + level * 14;

    // Aura
    const auraOpacity = level * 0.25;
    const auraScale   = 1.0 + level * 1.5;
    this._aura.material.opacity = auraOpacity;
    this._aura.scale.setScalar(auraScale);
    this._aura.material.color.copy(lColor);

    // Landing shake
    if (this._landingShake > 0) {
      this._landingShake *= 0.7;
      if (this._landingShake < 0.002) this._landingShake = 0;
    }

    // Trail at high bit levels
    if (held > 150) {
      this._trailTimer += dt;
      if (this._trailTimer > 0.04) {
        this._trailTimer = 0;
        this.effects?.spawnTrail(this.pos.clone(), held);
      }
    }
  }

  _updateCamera(dt) {
    // Smooth follow target
    this._camTarget.lerp(this.pos, Math.min(1, 12 * dt));

    // Apply camera shake + landing shake
    const shake = this._shakeAmount + this._landingShake;
    this._shakeAmount *= this._shakeDecay;
    if (this._shakeAmount < 0.001) this._shakeAmount = 0;

    const shakeX = (Math.random() - 0.5) * shake * 0.6;
    const shakeY = (Math.random() - 0.5) * shake * 0.3;

    // Orbit camera around follow target
    const camX = this._camTarget.x - Math.sin(this.yaw) * CAM_DISTANCE * Math.cos(this.pitch);
    const camY = this._camTarget.y + CAM_HEIGHT + Math.sin(this.pitch) * CAM_DISTANCE + shakeY;
    const camZ = this._camTarget.z - Math.cos(this.yaw) * CAM_DISTANCE * Math.cos(this.pitch);

    this.camera.position.set(camX + shakeX, camY, camZ);
    this.camera.lookAt(
      this._camTarget.x,
      this._camTarget.y + 1.0,
      this._camTarget.z
    );
  }

  // ── Network ───────────────────────────────────────────────
  _sendInput() {
    this.network.send(MSG.PLAYER_INPUT, {
      keys: { ...this._keys },
      yaw:  this.yaw,
      dt:   1 / GAME_CONFIG.SERVER_TICK_RATE,
    });
  }

  _sendAttack() {
    this.network.send(MSG.ATTACK, {
      yaw: this.yaw,
      x:   this.pos.x,
      y:   this.pos.y,
      z:   this.pos.z,
    });
  }

  _checkBankZone() {
    if (this.heldBits <= 0) { this._nearBankIndex = -1; return; }

    let closest = -1;
    let closestDist = Infinity;

    for (let i = 0; i < BANK_POSITIONS.length; i++) {
      const bp  = BANK_POSITIONS[i];
      const dx  = this.pos.x - bp.x;
      const dz  = this.pos.z - bp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < GAME_CONFIG.BANK_RADIUS && dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }

    if (closest !== this._nearBankIndex) {
      this._nearBankIndex = closest;
      if (closest >= 0 && !this.isBanking) {
        // Enter bank zone — tell server to start
        this.network.send(MSG.BANK_START, { zoneIndex: closest });
        this.isBanking = true;
        this.bankProgress = 0;
      } else if (closest < 0 && this.isBanking) {
        // Left zone — cancel
        this.network.send(MSG.BANK_CANCEL, {});
        this.isBanking = false;
      }
    }
  }

  // ── Server reconciliation ─────────────────────────────────
  applyServerPosition(sx, sy, sz, svx, svy, svz) {
    // Soft correction — only snap if very far off (e.g. teleport, death)
    const err = this.pos.distanceTo(_v3.set(sx, sy, sz));
    if (err > 5) {
      this.pos.set(sx, sy, sz);
      this.vel.set(svx, svy, svz);
    } else if (err > 0.5) {
      // Nudge gradually
      this.pos.lerp(_v3.set(sx, sy, sz), 0.2);
      this.vel.lerp(_v3.set(svx, svy, svz), 0.2);
    }
  }

  // ── Upgrade-aware stat getters ────────────────────────────
  _getMoveSpeed() {
    let s = GAME_CONFIG.MOVE_SPEED;
    if (this.upgrades.includes('quick_feet')) s *= 1.15;
    return s;
  }
  _getJumpForce() {
    let f = GAME_CONFIG.JUMP_FORCE;
    if (this.upgrades.includes('spring_legs')) f *= 1.30;
    return f;
  }
  _getDashCooldown() {
    let cd = GAME_CONFIG.DASH_COOLDOWN;
    if (this.upgrades.includes('quick_dash'))  cd *= 0.65;
    if (this.upgrades.includes('double_dash')) cd = GAME_CONFIG.DOUBLE_DASH_COOLDOWN;
    return cd;
  }

  // ── Cleanup ───────────────────────────────────────────────
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this.scene.remove(this.mesh);
  }
}

// ── Crown mesh helper ─────────────────────────────────────────
function _buildCrown() {
  const group = new THREE.Group();
  const mat   = new THREE.MeshBasicMaterial({ color: 0xffd700 });
  const baseGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 6);
  group.add(new THREE.Mesh(baseGeo, mat));

  const spikeH = [0.22, 0.32, 0.22, 0.18, 0.32, 0.18];
  for (let i = 0; i < 6; i++) {
    const sg = new THREE.ConeGeometry(0.07, spikeH[i], 4);
    const sm = new THREE.Mesh(sg, mat);
    const a  = (i / 6) * Math.PI * 2;
    sm.position.set(Math.cos(a) * 0.22, 0.06 + spikeH[i] / 2, Math.sin(a) * 0.22);
    group.add(sm);
  }
  return group;
}
