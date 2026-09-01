// ============================================================
// GREED.exe - Game.js
// Central orchestrator. Owns the Three.js renderer, game loop,
// and all subsystem instances. Routes all network messages.
// ============================================================

import * as THREE from 'three';
import { MSG } from '../../shared/messages.js';
import { GAME_CONFIG, ROUND_STATES, PLAYER_STATES } from '../../shared/constants.js';

import { NetworkClient }    from './networking/NetworkClient.js';
import { Arena }            from './world/Arena.js';
import { BitRenderer }      from './world/BitRenderer.js';
import { Hazards }          from './world/Hazards.js';
import { PlayerController } from './player/PlayerController.js';
import { RemotePlayer }     from './player/RemotePlayer.js';
import { EffectsManager }   from './effects/EffectsManager.js';
import { AudioManager }     from './audio/AudioManager.js';
import { HUD }              from './ui/HUD.js';
import { UpgradeMenu }      from './ui/UpgradeMenu.js';
import { ResultsScreen }    from './ui/ResultsScreen.js';
import { LobbyUI }          from './ui/LobbyUI.js';
import { MostWantedBanner } from './ui/MostWantedBanner.js';
import { MeltdownBanner }   from './ui/MeltdownBanner.js';

export class Game {
  constructor() {
    // ── Three.js core ──────────────────────────────────────
    this._canvas   = document.getElementById('game-canvas');
    this._renderer = new THREE.WebGLRenderer({
      canvas:     this._canvas,
      antialias:  true,
      powerPreference: 'high-performance',
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this._renderer.outputColorSpace   = THREE.SRGBColorSpace;
    this._renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;

    this._scene  = new THREE.Scene();
    this._scene.background = new THREE.Color(0x03080f);
    this._scene.fog = new THREE.FogExp2(0x03080f, 0.012);

    this._camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.1, 300
    );

    // ── State ─────────────────────────────────────────────
    this._playerId   = null;
    this._roomId     = null;
    this._roomState  = ROUND_STATES.LOBBY;
    this._myChips    = 0;
    this._myPendingChips = 0;
    this._kingId     = null;
    this._kingStreak = 0;
    this._mostWantedId = null;

    // ── Subsystems (created after joining) ────────────────
    this._network  = null;
    this._arena    = null;
    this._bits     = null;
    this._hazards  = null;
    this._player   = null;   // PlayerController (local)
    this._remotes  = new Map(); // playerId → RemotePlayer
    this._effects  = null;
    this._audio    = null;

    // ── UI ────────────────────────────────────────────────
    this._uiRoot     = document.getElementById('ui-root');
    this._hud        = null;
    this._upgradeMenu = null;
    this._results    = null;
    this._lobby      = null;
    this._mwBanner   = null;
    this._meltBanner = null;

    // ── Loop ──────────────────────────────────────────────
    this._running    = false;
    this._lastTime   = 0;
    this._frameId    = null;

    // ── Timing ────────────────────────────────────────────
    this._dashCooldownStart = 0;
    this._lastBankProgressTime = 0;

    window.addEventListener('resize', () => this._onResize());
  }

  // ── Boot ──────────────────────────────────────────────────
  init(network) {
    this._network = network;
    this._bindNetworkHandlers();

    // Create subsystems that don't need player identity
    this._effects = new EffectsManager(this._scene);
    this._audio   = new AudioManager();

    // UI layer (always present)
    this._hud         = new HUD();
    this._upgradeMenu = new UpgradeMenu(this._uiRoot, (id) => this._onUpgradeSelected(id));
    this._results     = new ResultsScreen(this._uiRoot, this._network);
    this._lobby       = new LobbyUI(this._uiRoot);
    this._mwBanner    = new MostWantedBanner(this._uiRoot);
    this._meltBanner  = new MeltdownBanner(this._uiRoot);

    // Show lobby while waiting
    this._lobby.show({ players: [], countdown: -1 });
    this._hud.hide();
  }

  // ── Join room (called after server sends JOIN_ACK) ────────
  _joinRoom(ackMsg) {
    this._playerId = ackMsg.playerId;
    this._roomId   = ackMsg.roomId;
    this._results.setPlayerId(this._playerId);

    // Init audio now (after user gesture)
    this._audio.init();

    // Build world
    this._arena   = new Arena(this._scene);
    this._bits    = new BitRenderer(this._scene);
    this._hazards = new Hazards(this._scene, this._arena);

    // Local player
    this._player = new PlayerController(
      this._scene, this._camera, this._network,
      this._effects, this._audio
    );
    this._player.setPlayerId(this._playerId);

    // Apply full room snapshot
    const snap = ackMsg.roomState;
    if (snap) this._applyRoomSnapshot(snap);

    // Start render loop
    this._running = true;
    this._lastTime = performance.now();
    this._loop();
  }

  _applyRoomSnapshot(snap) {
    this._roomState  = snap.state;
    this._kingId     = snap.king?.playerId;
    this._kingStreak = snap.king?.streak || 0;

    // Populate existing players
    for (const pd of snap.players || []) {
      if (pd.id === this._playerId) {
        // Set own start position
        this._player.setPosition(pd.x, pd.y, pd.z);
        this._player.heldBits   = pd.heldBits  || 0;
        this._player.bankedBits = pd.bankedBits || 0;
        this._player.setUpgrades(pd.upgrades || []);
      } else {
        this._addRemotePlayer(pd);
      }
    }

    // Populate bits
    for (const bit of snap.bits || []) {
      this._bits.addBit(bit);
    }

    // Closed banks
    for (const idx of snap.closedBankIds || []) {
      this._arena.closeBank(idx);
    }

    // Meltdown state
    if (snap.meltdown?.active) {
      this._activateMeltdown();
    }

    // Round timer
    if (snap.round) {
      this._hud.setTimer(snap.round.remaining, snap.round.phase);
    }

    // King
    if (this._kingId) {
      const kp = snap.players?.find(p => p.id === this._kingId);
      this._hud.setKing(kp?.name || '???', this._kingStreak);
      this._player.setKing(this._kingId === this._playerId);
      this._remotes.get(this._kingId)?.setKing(true);
    }

    // Show appropriate UI
    if (this._roomState === ROUND_STATES.LOBBY) {
      this._lobby.show({
        players:     snap.players,
        myId:        this._playerId,
        kingId:      this._kingId,
        kingName:    snap.players?.find(p => p.id === this._kingId)?.name,
        kingStreak:  this._kingStreak,
        countdown:   snap.round?.countdown ?? -1,
      });
    } else {
      this._lobby.hide();
      this._hud.show();
    }
  }

  // ── Network handlers ──────────────────────────────────────
  _bindNetworkHandlers() {
    const net = this._network;

    net.on(MSG.JOIN_ACK,          msg => this._joinRoom(msg));
    net.on(MSG.PLAYER_JOINED,     msg => this._onPlayerJoined(msg));
    net.on(MSG.PLAYER_LEFT,       msg => this._onPlayerLeft(msg));
    net.on(MSG.WORLD_SNAPSHOT,    msg => this._onWorldSnapshot(msg));
    net.on(MSG.BIT_SPAWN,         msg => this._bits?.addBit(msg.bit));
    net.on(MSG.BIT_SPAWN_BATCH,   msg => this._bits?.addBits(msg.bits || []));
    net.on(MSG.BIT_COLLECTED,     msg => this._onBitCollected(msg));
    net.on(MSG.BIT_DROPPED,       msg => this._onBitDropped(msg));
    net.on(MSG.BIT_REMOVE,        msg => this._bits?.removeBit(msg.bitId));
    net.on(MSG.PLAYER_HIT,        msg => this._onPlayerHit(msg));
    net.on(MSG.PLAYER_DIED,       msg => this._onPlayerDied(msg));
    net.on(MSG.PLAYER_RESPAWNED,  msg => this._onPlayerRespawned(msg));
    net.on(MSG.BANK_PROGRESS,     msg => this._onBankProgress(msg));
    net.on(MSG.BANK_CANCEL,       msg => this._onBankCancel(msg));
    net.on(MSG.BANK_COMPLETE,     msg => this._onBankComplete(msg));
    net.on(MSG.BANK_CLOSED,       msg => this._arena?.closeBank(msg.zoneIndex));
    net.on(MSG.UPGRADE_OPTIONS,   msg => this._onUpgradeOptions(msg));
    net.on(MSG.UPGRADE_APPLIED,   msg => this._onUpgradeApplied(msg));
    net.on(MSG.MOST_WANTED_SET,   msg => this._onMostWantedSet(msg));
    net.on(MSG.MOST_WANTED_CLEAR, ()  => this._onMostWantedClear());
    net.on(MSG.MOST_WANTED_REVEAL,msg => this._onMostWantedReveal(msg));
    net.on(MSG.ROUND_STATE_CHANGE,msg => this._onRoundStateChange(msg));
    net.on(MSG.MELTDOWN_START,    msg => this._onMeltdownStart(msg));
    net.on(MSG.MELTDOWN_TICK,     msg => this._onMeltdownTick(msg));
    net.on(MSG.ROUND_END,         ()  => this._onRoundEnd());
    net.on(MSG.RESULTS,           msg => this._onResults(msg));
    net.on(MSG.LOBBY_COUNTDOWN,   msg => this._onLobbyCountdown(msg));
    net.on(MSG.KING_UPDATE,       msg => this._onKingUpdate(msg));
    net.on(MSG.RIVAL_SET,         msg => this._onRivalSet(msg));
    net.on(MSG.CHIPS_UPDATE,      msg => this._onChipsUpdate(msg));
    net.on(MSG.GREED_RESULT,      msg => this._results?.showGreedResult(msg, this._audio));
    net.on(MSG.PLATFORM_COLLAPSE, msg => this._arena?.collapsePlatform(msg.platformId));
    net.on(MSG.HAZARD_TRIGGER,    msg => this._hazards?.spawnSparks(msg.x, msg.y, msg.z));
  }

  // ── Player events ─────────────────────────────────────────
  _onPlayerJoined(msg) {
    const pd = msg.player;
    if (!pd || pd.id === this._playerId) return;
    this._addRemotePlayer(pd);
    this._lobby?.update({
      players:    this._getPublicPlayerList(),
      myId:       this._playerId,
      kingId:     this._kingId,
    });
  }

  _onPlayerLeft(msg) {
    const remote = this._remotes.get(msg.playerId);
    if (remote) { remote.dispose(); this._remotes.delete(msg.playerId); }
    this._lobby?.update({ players: this._getPublicPlayerList(), myId: this._playerId });
  }

  _addRemotePlayer(pd) {
    if (this._remotes.has(pd.id)) return;
    const rp = new RemotePlayer(this._scene, pd, this._effects);
    this._remotes.set(pd.id, rp);
    if (pd.id === this._kingId) rp.setKing(true);
  }

  // ── World snapshot ────────────────────────────────────────
  _onWorldSnapshot(msg) {
    const { snapshot, serverTime } = msg;
    if (!snapshot?.players) return;

    const now = Date.now();

    for (const entry of snapshot.players) {
      if (entry.id === this._playerId) {
        // Server reconciliation for local player
        this._player?.applyServerPosition(
          entry.x, entry.y, entry.z,
          entry.vx, entry.vy, entry.vz
        );
        // Sync authoritative values
        if (this._player) {
          this._player.heldBits   = entry.held ?? this._player.heldBits;
          this._player.state      = entry.state;
          if (entry.state === PLAYER_STATES.DEAD) {
            this._player.die();
          } else if (this._player.state === PLAYER_STATES.ALIVE) {
            this._player.respawn?.();
          }
        }
        this._hud?.setHeldBits(entry.held ?? 0);
        this._hud?.setMostWantedSelf(entry.mw === 1);
        continue;
      }

      let rp = this._remotes.get(entry.id);
      if (!rp) {
        // Late-join player we haven't seen yet
        rp = new RemotePlayer(this._scene, { id: entry.id, name: '???' }, this._effects);
        this._remotes.set(entry.id, rp);
      }
      rp.pushSnapshot({ ...entry, t: now });
    }
  }

  // ── BIT events ────────────────────────────────────────────
  _onBitCollected(msg) {
    if (!msg.collected) return;
    for (const c of msg.collected) {
      this._bits.removeBit(c.bitId);
    }

    const isMe = msg.playerId === this._playerId;
    if (isMe) {
      this._hud?.setHeldBits(msg.newHeld ?? 0);
      const total = msg.collected.reduce((s, c) => s + (c.value || 1), 0);
      if (total >= 8) {
        this._audio?.play('bit_pickup_large');
      } else {
        this._audio?.play('bit_pickup');
      }
      // Request pickup (may already be handled, but send coords for validation)
    }
  }

  _onBitDropped(msg) {
    if (msg.bits) this._bits.addBits(msg.bits);
    // Visual scatter burst at origin
    if (msg.origin) {
      this._bits.spawnDeathBurst(msg.origin.x, msg.origin.y || 0.5, msg.origin.z, 50);
    }
  }

  // ── Combat events ─────────────────────────────────────────
  _onPlayerHit(msg) {
    const isMe = msg.targetId === this._playerId;
    const kb   = msg.knockback || {};

    if (isMe) {
      this._player?.applyKnockback(kb.x || 0, kb.y || 0, kb.z || 0);
      this._effects?.flashScreen('rgba(255,80,0,0.35)', 130);
      this._audio?.play('hit_received');
    } else {
      this._audio?.play('hit');
    }

    // Get hit position
    const rp  = this._remotes.get(msg.targetId);
    const pos = rp?.mesh?.position;
    if (pos) {
      const force = Math.sqrt((kb.x||0)**2 + (kb.y||0)**2 + (kb.z||0)**2);
      if (force > 25) {
        this._effects?.spawnBigHit(pos.x, pos.y, pos.z);
      } else {
        this._effects?.spawnHit(pos.x, pos.y, pos.z, kb, msg.stolen || 0);
      }
    } else if (isMe) {
      this._effects?.spawnHit(
        this._player.pos.x, this._player.pos.y, this._player.pos.z, kb, msg.stolen || 0
      );
    }
  }

  _onPlayerDied(msg) {
    const isMe = msg.playerId === this._playerId;
    const x = msg.x || 0, y = msg.y || 0, z = msg.z || 0;

    this._effects?.spawnDeath(x, y, z, msg.droppedBits || 0);
    this._audio?.play('death');

    if (isMe) {
      this._player.die();
      this._hud?.setHeldBits(0);
      this._hud?.showRespawn(GAME_CONFIG.RESPAWN_DELAY / 1000);
      this._effects?.flashScreen('rgba(255,0,0,0.5)', 250);

      // Countdown timer display
      const respawnAt = Date.now() + GAME_CONFIG.RESPAWN_DELAY;
      const interval  = setInterval(() => {
        const left = (respawnAt - Date.now()) / 1000;
        if (left <= 0) {
          clearInterval(interval);
          this._hud?.hideRespawn();
        } else {
          this._hud?.showRespawn(left);
        }
      }, 100);
    } else {
      const rp = this._remotes.get(msg.playerId);
      if (rp) rp.state = PLAYER_STATES.DEAD;
    }

    if (msg.cause === 'revenge_blast') {
      this._effects?.spawnRevengeBlast(x, y, z);
    }
  }

  _onPlayerRespawned(msg) {
    const isMe = msg.playerId === this._playerId;
    if (isMe) {
      this._player.respawn();
      this._player.setPosition(msg.x, msg.y, msg.z);
      this._hud?.hideRespawn();
      this._effects?.spawnRespawn(msg.x, msg.y, msg.z);
      this._audio?.play('respawn');
    } else {
      const rp = this._remotes.get(msg.playerId);
      if (rp) {
        rp.state = PLAYER_STATES.ALIVE;
        rp.pushSnapshot({ x: msg.x, y: msg.y, z: msg.z, state: PLAYER_STATES.ALIVE, t: Date.now() });
      }
      this._effects?.spawnRespawn(msg.x, msg.y, msg.z);
    }
  }

  // ── Banking events ────────────────────────────────────────
  _onBankProgress(msg) {
    this._hud?.setBanking(true, msg.progress || 0);
    const now = Date.now();
    if (now - this._lastBankProgressTime > 400) {
      this._lastBankProgressTime = now;
      this._audio?.play('bank_progress');
    }
  }

  _onBankCancel(msg) {
    if (this._player) this._player.isBanking = false;
    this._hud?.setBanking(false);
    this._audio?.play('bank_cancel');
  }

  _onBankComplete(msg) {
    const isMe = msg.playerId === this._playerId;
    if (isMe) {
      if (this._player) {
        this._player.isBanking  = false;
        this._player.heldBits   = 0;
        this._player.bankedBits = msg.newBanked || 0;
      }
      this._hud?.setHeldBits(0);
      this._hud?.setBankedBits(msg.newBanked || 0);
      this._hud?.setBanking(false);
      this._effects?.bankSuccessPulse();
      this._audio?.play('bank_complete');
    }

    // Visual on bank terminal
    const rp  = this._remotes.get(msg.playerId);
    const pos = rp?.mesh?.position || this._player?.pos;
    if (pos) this._effects?.spawnBankComplete(pos.x, pos.y, pos.z, msg.amount || 0);
  }

  // ── Upgrade events ────────────────────────────────────────
  _onUpgradeOptions(msg) {
    this._audio?.play('upgrade');
    this._upgradeMenu.show(msg.options || []);
  }

  _onUpgradeSelected(upgradeId) {
    this._network.send(MSG.UPGRADE_SELECTED, { upgradeId });
  }

  _onUpgradeApplied(msg) {
    if (msg.playerId === this._playerId) {
      this._player?.setUpgrades([...(this._player.upgrades || []), msg.upgradeId]);
      this._hud?.setUpgrades(this._player?.upgrades || []);
    }
  }

  // ── Most Wanted ───────────────────────────────────────────
  _onMostWantedSet(msg) {
    this._mostWantedId = msg.playerId;
    const isMe = msg.playerId === this._playerId;

    this._mwBanner.flash(msg.name, msg.heldBits, msg.killReward);
    this._audio?.play('most_wanted');
    this._hud?.setMostWanted(msg.name);
    this._hud?.setMostWantedSelf(isMe);

    if (isMe) this._effects?.mostWantedFlash();

    const rp = this._remotes.get(msg.playerId);
    if (rp) {
      rp.isMostWanted = true;
      rp._applyMostWanted(true);
    }
  }

  _onMostWantedClear() {
    const prev = this._remotes.get(this._mostWantedId);
    if (prev) { prev.isMostWanted = false; prev._applyMostWanted(false); }
    this._mostWantedId = null;
    this._hud?.setMostWanted(null);
    this._hud?.setMostWantedSelf(false);
    if (this._player) this._player.setKing?.(this._kingId === this._playerId);
  }

  _onMostWantedReveal(msg) {
    // Flash marker at revealed location
    this._effects?.spawnMostWanted(msg.x, msg.y, msg.z);
  }

  // ── Round state ───────────────────────────────────────────
  _onRoundStateChange(msg) {
    const prev = this._roomState;
    this._roomState = msg.state;

    if (msg.state === ROUND_STATES.PLAYING) {
      this._lobby.hide();
      this._results.hide();
      this._hud.show();
      this._bits.clearAll();
      this._remotes.forEach(rp => {
        rp.heldBits  = 0;
        rp.upgrades  = [];
      });
      if (this._player) {
        this._player.heldBits   = 0;
        this._player.bankedBits = 0;
        this._player.upgrades   = [];
      }
      this._hud.setHeldBits(0);
      this._hud.setBankedBits(0);
      this._hud.setUpgrades([]);
    }

    if (msg.state === ROUND_STATES.RESULTS) {
      this._hud.hide();
    }

    if (msg.state === ROUND_STATES.LOBBY) {
      this._results.hide();
      this._effects?.stopMeltdown();
      this._audio?.stopMeltdownMusic();
      this._arena?.resetEnvironment();
      this._hazards?.resetMeltdown();
      this._hud.hide();
      this._lobby.show({
        players:    this._getPublicPlayerList(),
        myId:       this._playerId,
        kingId:     this._kingId,
        kingName:   this._getPlayerName(this._kingId),
        kingStreak: this._kingStreak,
        countdown:  -1,
      });
    }
  }

  _onMeltdownStart(msg) {
    this._activateMeltdown();
    this._meltBanner.show();
    this._audio?.startMeltdownMusic();
    this._audio?.play('meltdown');
  }

  _activateMeltdown() {
    this._arena?.startMeltdown();
    this._hazards?.startMeltdown();
    this._effects?.startMeltdown();
    this._hud?.setTimer(GAME_CONFIG.MELTDOWN_DURATION, 'MELTDOWN');
  }

  _onMeltdownTick(msg) {
    this._hud?.setTimer(msg.remaining, msg.phase || this._roomState);

    // Final countdown audio
    if (msg.remaining <= GAME_CONFIG.MELTDOWN_FINAL_COUNTDOWN && msg.remaining > 0) {
      this._audio?.play('countdown', { final: msg.remaining <= 3 });
    }
  }

  _onRoundEnd() {
    // Server locks scoring — visual freeze signal
    this._effects?.flashScreen('rgba(255,255,255,0.15)', 500);
  }

  _onResults(msg) {
    this._hud.hide();
    this._upgradeMenu.hide();
    this._effects?.stopMeltdown();
    this._audio?.stopMeltdownMusic();
    this._audio?.play('victory');

    this._results.show(msg, this._myPendingChips, this._audio);
  }

  _onLobbyCountdown(msg) {
    this._lobby?.update({
      players:    this._getPublicPlayerList(),
      myId:       this._playerId,
      kingId:     this._kingId,
      countdown:  msg.seconds,
    });
  }

  // ── King / Rival / Chips ──────────────────────────────────
  _onKingUpdate(msg) {
    const prevKing = this._kingId;
    this._kingId     = msg.playerId;
    this._kingStreak = msg.streak;

    // Clear old king visuals
    if (prevKing !== this._kingId) {
      this._remotes.get(prevKing)?.setKing(false);
      if (prevKing === this._playerId) this._player?.setKing(false);
    }

    // Set new king visuals
    if (this._kingId === this._playerId) {
      this._player?.setKing(true);
    } else {
      this._remotes.get(this._kingId)?.setKing(true);
    }

    this._hud?.setKing(msg.name, msg.streak);
    this._audio?.play('king');
  }

  _onRivalSet(msg) {
    this._hud?.setRival(msg.rivalName);
  }

  _onChipsUpdate(msg) {
    this._myChips        = msg.chips;
    this._myPendingChips = msg.earned || 0;
  }

  // ── Pickup dispatch ───────────────────────────────────────
  // Called from the game loop — detect nearby bits and request pickup
  _dispatchPickupRequests() {
    if (!this._player || this._player.state !== PLAYER_STATES.ALIVE) return;
    if (this._roomState !== ROUND_STATES.PLAYING &&
        this._roomState !== ROUND_STATES.MELTDOWN) return;

    const px = this._player.pos.x;
    const pz = this._player.pos.z;
    const radius = GAME_CONFIG.BIT_PICKUP_RADIUS * 1.2; // slightly generous client-side
    const candidates = [];

    for (const [, bit] of this._bits._bits) {
      const dx = px - bit.x, dz = pz - bit.z;
      if (Math.sqrt(dx * dx + dz * dz) <= radius) {
        candidates.push(bit.id);
      }
    }

    if (candidates.length > 0) {
      this._network.send(MSG.BIT_REQUEST_PICKUP, { bitIds: candidates });
    }
  }

  // ── Rankings helper ───────────────────────────────────────
  _buildRankings() {
    const list = [];

    if (this._player) {
      list.push({
        id:         this._playerId,
        name:       'YOU',
        bankedBits: this._player.bankedBits || 0,
        isMe:       true,
      });
    }

    for (const [id, rp] of this._remotes) {
      list.push({
        id,
        name:       rp.name,
        bankedBits: rp.bankedBits || 0,
        isMe:       false,
      });
    }

    return list.sort((a, b) => b.bankedBits - a.bankedBits);
  }

  // ── Helper getters ────────────────────────────────────────
  _getPublicPlayerList() {
    const list = [];
    if (this._playerId) {
      list.push({
        id:     this._playerId,
        name:   'YOU',
        chips:  this._myChips,
      });
    }
    for (const [id, rp] of this._remotes) {
      list.push({ id, name: rp.name });
    }
    return list;
  }

  _getPlayerName(id) {
    if (!id) return null;
    if (id === this._playerId) return 'YOU';
    return this._remotes.get(id)?.name || '???';
  }

  // ── Render loop ───────────────────────────────────────────
  _loop() {
    if (!this._running) return;
    this._frameId = requestAnimationFrame(() => this._loop());

    const now = performance.now();
    const dt  = Math.min((now - this._lastTime) / 1000, 0.05); // cap at 50ms
    this._lastTime = now;

    this._update(dt, now);
    this._renderer.render(this._scene, this._camera);
  }

  _update(dt, now) {
    // Local player
    this._player?.update(dt, now);

    // Remote players
    for (const rp of this._remotes.values()) {
      rp.update(dt, now);
    }

    // World
    this._arena?.update(dt, now);
    this._bits?.update(dt, now);
    this._hazards?.update(dt, now);

    // Effects (pass camera for floating number projection)
    this._effects?.update(dt, this._camera);

    // HUD
    this._hud?.update(dt);

    // Pickup detection (every frame, cheap linear scan)
    this._dispatchPickupRequests();

    // Rankings update (every second-ish, amortised by frame rate)
    if (now % 1000 < 50) {
      this._hud?.setRankings(this._buildRankings());
    }

    // Dash cooldown ring
    if (this._player) {
      const elapsed = now - (this._player._lastDash || 0);
      const cd      = this._player._getDashCooldown();
      this._hud?.setDashCooldown(Math.min(1, elapsed / cd));
      this._hud?.setLatency(this._network?.latency || 0);
    }
  }

  // ── Resize ────────────────────────────────────────────────
  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  // ── Teardown ──────────────────────────────────────────────
  dispose() {
    this._running = false;
    cancelAnimationFrame(this._frameId);
    this._player?.dispose();
    this._remotes.forEach(rp => rp.dispose());
    this._arena?.dispose();
    this._bits?.dispose();
    this._hazards?.dispose();
    this._effects?.dispose();
    this._audio?.dispose();
    this._hud?.dispose();
    this._upgradeMenu?.dispose();
    this._results?.dispose();
    this._lobby?.dispose();
    this._renderer.dispose();
  }
}
