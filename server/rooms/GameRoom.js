// ============================================================
// GREED.exe - GameRoom
// One isolated match instance. Owns all game subsystems.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { MSG }          from '../../shared/messages.js';
import { GAME_CONFIG, ROUND_STATES } from '../../shared/constants.js';
import { ConnectionManager } from '../networking/ConnectionManager.js';
import { PlayerManager }     from '../players/PlayerManager.js';
import { BitManager }        from '../bits/BitManager.js';
import { CombatManager }     from '../combat/CombatManager.js';
import { UpgradeManager }    from '../upgrades/UpgradeManager.js';
import { RoundManager }      from '../game/RoundManager.js';
import { MeltdownManager }   from '../game/MeltdownManager.js';

export class GameRoom {
  constructor(roomManagerRef) {
    this.id          = uuidv4().slice(0, 8).toUpperCase();
    this.roomManager = roomManagerRef;

    // Subsystems
    this.playerManager  = new PlayerManager(this);
    this.bitManager     = new BitManager(this);
    this.combatManager  = new CombatManager(this);
    this.upgradeManager = new UpgradeManager(this);
    this.roundManager   = new RoundManager(this);
    this.meltdownManager = new MeltdownManager(this);

    // Room state
    this.state      = ROUND_STATES.LOBBY;
    this.kingId     = null;      // playerId of current king
    this.kingStreak = 0;
    this.closedBankIds = [];     // indices shut during meltdown

    // Snapshot tick
    this._tickInterval = setInterval(() => this._tick(), 1000 / GAME_CONFIG.SERVER_TICK_RATE);

    console.log(`[Room ${this.id}] Created`);
  }

  // ── Player management ────────────────────────────────────
  canAcceptPlayer() {
    if (this.playerManager.getCount() >= GAME_CONFIG.MAX_PLAYERS_PER_ROOM) return false;
    // Don't accept new players mid-round (they'd miss context)
    // Allow join during LOBBY, STARTING, or RESULTS
    return this.state !== ROUND_STATES.PLAYING && this.state !== ROUND_STATES.MELTDOWN;
  }

  addPlayer(playerId, name, connectionId) {
    return this.playerManager.addPlayer(playerId, name, connectionId);
  }

  removePlayer(playerId) {
    this.playerManager.removePlayer(playerId);

    // If room is empty, schedule destruction
    if (this.playerManager.getCount() === 0) {
      setTimeout(() => {
        if (this.playerManager.getCount() === 0) {
          this.roomManager.destroyRoom(this.id);
        }
      }, 5000);
    }

    // Check if min players lost during lobby countdown
    this.roundManager.onPlayerCountChanged();
  }

  getPlayerCount() {
    return this.playerManager.getCount();
  }

  // ── Message routing ──────────────────────────────────────
  handleMessage(playerId, msg) {
    switch (msg.type) {
      case MSG.PLAYER_INPUT:
        this.playerManager.handleInput(playerId, msg);
        break;
      case MSG.ATTACK:
        this.combatManager.handleAttack(playerId, msg);
        break;
      case MSG.BANK_START:
        this.playerManager.handleBankStart(playerId, msg);
        break;
      case MSG.BANK_CANCEL:
        this.playerManager.handleBankCancel(playerId);
        break;
      case MSG.BIT_REQUEST_PICKUP:
        this.bitManager.handlePickupRequest(playerId, msg);
        break;
      case MSG.UPGRADE_SELECTED:
        this.upgradeManager.handleSelection(playerId, msg);
        break;
      case MSG.GREED_BUTTON:
        this.roundManager.handleGreedButton(playerId, msg);
        break;
      default:
        break;
    }
  }

  // ── Broadcasting helpers ──────────────────────────────────
  broadcast(type, data, excludePlayerId = null) {
    const excludeConnId = excludePlayerId
      ? this.playerManager.getConnectionId(excludePlayerId)
      : null;
    ConnectionManager.broadcastToRoom(this.id, type, data, excludeConnId);
  }

  sendToPlayer(playerId, type, data) {
    ConnectionManager.sendToPlayer(playerId, type, data);
  }

  // ── State snapshot (for new joiners + reconnects) ─────────
  getStateSnapshot() {
    return {
      roomId:   this.id,
      state:    this.state,
      players:  this.playerManager.getAllPublicStates(),
      bits:     this.bitManager.getAllBits(),
      round:    this.roundManager.getSnapshot(),
      king:     { playerId: this.kingId, streak: this.kingStreak },
      meltdown: this.meltdownManager.getSnapshot(),
      closedBankIds: this.closedBankIds,
    };
  }

  // ── King management ───────────────────────────────────────
  setKing(playerId) {
    if (this.kingId === playerId) {
      this.kingStreak++;
    } else {
      this.kingId     = playerId;
      this.kingStreak = 1;
    }
    this.broadcast(MSG.KING_UPDATE, {
      playerId: this.kingId,
      streak:   this.kingStreak,
      name:     this.playerManager.getPlayer(playerId)?.name || '???',
    });
  }

  clearKing() {
    this.kingId     = null;
    this.kingStreak = 0;
  }

  // ── Server tick ───────────────────────────────────────────
  _tick() {
    if (this.state === ROUND_STATES.LOBBY) return;

    this.playerManager.tick();
    this.bitManager.tick();

    // Send world snapshot
    const snapshot = this.playerManager.buildSnapshot();
    if (snapshot.players.length > 0) {
      this.broadcast(MSG.WORLD_SNAPSHOT, { snapshot, serverTime: Date.now() });
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────
  setState(newState) {
    this.state = newState;
    this.broadcast(MSG.ROUND_STATE_CHANGE, { state: newState, serverTime: Date.now() });
    console.log(`[Room ${this.id}] State → ${newState}`);
  }

  destroy() {
    clearInterval(this._tickInterval);
    this.bitManager.destroy();
    this.roundManager.destroy();
    this.meltdownManager.destroy();
    console.log(`[Room ${this.id}] Destroyed`);
  }
}
