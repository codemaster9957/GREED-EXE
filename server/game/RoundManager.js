// ============================================================
// GREED.exe - RoundManager
// Controls the full match lifecycle:
// LOBBY → STARTING → PLAYING → MELTDOWN → RESULTS → LOBBY
// ============================================================

import {
  GAME_CONFIG,
  ROUND_STATES,
  PLAYER_STATES,
  SPAWN_POSITIONS,
} from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

export class RoundManager {
  constructor(room) {
    this.room          = room;
    this.roundTime     = 0;          // seconds elapsed this round
    this.roundTimer    = null;       // setInterval handle
    this.lobbyTimer    = null;
    this.lobbyCountdown = 0;
    this.scoringLocked = false;
  }

  // ── Lobby ─────────────────────────────────────────────────
  startLobbyCountdown() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.lobbyCountdown = GAME_CONFIG.LOBBY_COUNTDOWN;
    this.room.broadcast(MSG.LOBBY_COUNTDOWN, { seconds: this.lobbyCountdown });

    this.lobbyTimer = setInterval(() => {
      this.lobbyCountdown--;
      this.room.broadcast(MSG.LOBBY_COUNTDOWN, { seconds: this.lobbyCountdown });

      if (this.lobbyCountdown <= 0) {
        clearInterval(this.lobbyTimer);
        this.lobbyTimer = null;
        this.startRound();
      }
    }, 1000);
  }

  onPlayerCountChanged() {
    const count = this.room.playerManager.getCount();
    const state = this.room.state;

    if (state === ROUND_STATES.LOBBY) {
      if (count >= GAME_CONFIG.MIN_PLAYERS_TO_START && !this.lobbyTimer) {
        this.startLobbyCountdown();
      } else if (count < GAME_CONFIG.MIN_PLAYERS_TO_START && this.lobbyTimer) {
        clearInterval(this.lobbyTimer);
        this.lobbyTimer = null;
        this.room.broadcast(MSG.LOBBY_COUNTDOWN, { seconds: -1, waiting: true });
      }
    }
  }

  // ── Round ─────────────────────────────────────────────────
  startRound() {
    const room = this.room;
    room.setState(ROUND_STATES.PLAYING);
    room.closedBankIds = [];
    this.roundTime     = 0;
    this.scoringLocked = false;

    // Reset all player round stats but keep chips
    for (const p of room.playerManager.getAllPlayers()) {
      p.heldBits   = 0;
      p.bankedBits = 0;
      p.kills      = 0;
      p.deaths     = 0;
      p.stolen     = 0;
      p.mostWantedKills = 0;
      p.biggestSingleBank = 0;
      p.highestHeld    = 0;
      p.biggestFumble  = 0;
      p.upgrades       = [];
      p.isMostWanted   = false;
      p.rivalId        = null;
      p.rivalData      = {};
      p.state          = PLAYER_STATES.ALIVE;
      p.isBanking      = false;
      p.shieldUntil    = 0;
      p.lastAttackTime = 0;
      p.lastDashTime   = 0;
      p.nextUpgradeAt  = GAME_CONFIG.UPGRADE_INTERVAL;
    }

    // Respawn everyone to starting positions
    const players = room.playerManager.getAllPlayers();
    players.forEach((p, idx) => {
      const sp = SPAWN_POSITIONS[idx % SPAWN_POSITIONS.length];
      p.x = sp.x; p.y = sp.y; p.z = sp.z;
      p.vx = p.vy = p.vz = 0;
    });

    // Start subsystems
    room.bitManager.startSpawning();
    room.upgradeManager.startOfferCycle(Date.now());

    // Round timer tick (every second)
    if (this.roundTimer) clearInterval(this.roundTimer);
    this.roundTimer = setInterval(() => this._onSecondTick(), 1000);

    console.log(`[Room ${room.id}] Round started`);
  }

  _onSecondTick() {
    this.roundTime++;
    const room      = this.room;
    const remaining = GAME_CONFIG.ROUND_DURATION - this.roundTime;

    // Broadcast time (lightweight, every 5s normally, every second in final 30)
    if (remaining <= 30 || this.roundTime % 5 === 0) {
      room.broadcast(MSG.MELTDOWN_TICK, {
        remaining,
        total: GAME_CONFIG.ROUND_DURATION,
        phase: room.state,
      });
    }

    // Trigger Meltdown
    if (remaining <= 0 && room.state === ROUND_STATES.PLAYING) {
      this._startMeltdown();
    }
  }

  // ── Meltdown ──────────────────────────────────────────────
  _startMeltdown() {
    const room = this.room;
    room.setState(ROUND_STATES.MELTDOWN);
    room.bitManager.startMeltdownSpawning();
    room.meltdownManager.start();

    // Close some banks
    const bankCount   = 5; // BANK_POSITIONS.length
    const closeCount  = GAME_CONFIG.BANKS_CLOSED_ON_MELTDOWN;
    const toClose     = _shuffle([0,1,2,3,4]).slice(0, closeCount);
    room.closedBankIds = toClose;
    for (const idx of toClose) {
      room.broadcast(MSG.BANK_CLOSED, { zoneIndex: idx });
    }

    console.log(`[Room ${room.id}] MELTDOWN started!`);
  }

  // ── End round (called by MeltdownManager) ────────────────
  endRound() {
    if (this.scoringLocked) return;
    this.scoringLocked = true;

    clearInterval(this.roundTimer);
    this.roundTimer = null;

    const room = this.room;
    room.setState(ROUND_STATES.RESULTS);
    room.bitManager.stopSpawning();
    room.upgradeManager.stopOfferCycle();

    room.broadcast(MSG.ROUND_END, { serverTime: Date.now() });

    // Calculate and send results after brief delay
    setTimeout(() => this._sendResults(), 500);
  }

  _sendResults() {
    const room    = this.room;
    const players = room.playerManager.getAllPlayers();

    // Sort by banked bits
    const ranked = [...players].sort((a, b) => b.bankedBits - a.bankedBits);

    // Awards
    const greediest      = [...players].sort((a, b) => b.highestHeld   - a.highestHeld)[0];
    const biggestFumble  = [...players].sort((a, b) => b.biggestFumble - a.biggestFumble)[0];
    const masterThief    = [...players].sort((a, b) => b.stolen        - a.stolen)[0];
    const mostViolent    = [...players].sort((a, b) => b.kills         - a.kills)[0];
    const safest         = [...players].sort((a, b) => a.deaths        - b.deaths)[0];
    const biggestCashout = [...players].sort((a, b) => b.biggestSingleBank - a.biggestSingleBank)[0];

    // CHIPS rewards
    const chipRewards = {};
    for (let i = 0; i < ranked.length; i++) {
      const p     = ranked[i];
      let chips   = GAME_CONFIG.CHIPS_PLACEMENT[i] || 0;
      chips      += Math.floor(p.bankedBits * GAME_CONFIG.CHIPS_PER_BANKED_BIT);
      chips      += p.kills * GAME_CONFIG.CHIPS_PER_KILL;
      chips      += p.mostWantedKills * GAME_CONFIG.CHIPS_MOST_WANTED_KILL;
      p.chips    += chips;
      p.pendingChipReward = chips;
      chipRewards[p.id]   = chips;
    }

    // King: winner becomes new king
    if (ranked.length > 0) {
      room.setKing(ranked[0].id);
    }

    const results = {
      ranked: ranked.map((p, idx) => ({
        rank:       idx + 1,
        playerId:   p.id,
        name:       p.name,
        bankedBits: p.bankedBits,
        kills:      p.kills,
        deaths:     p.deaths,
        stolen:     p.stolen,
        highestHeld: p.highestHeld,
        biggestBank: p.biggestSingleBank,
        mostWantedKills: p.mostWantedKills,
        biggestFumble: p.biggestFumble,
        chips:       chipRewards[p.id] || 0,
      })),
      awards: {
        greediest:       greediest     ? { playerId: greediest.id,      name: greediest.name,      value: greediest.highestHeld }     : null,
        biggestFumble:   biggestFumble ? { playerId: biggestFumble.id,  name: biggestFumble.name,  value: biggestFumble.biggestFumble }: null,
        masterThief:     masterThief   ? { playerId: masterThief.id,    name: masterThief.name,    value: masterThief.stolen }        : null,
        mostViolent:     mostViolent   ? { playerId: mostViolent.id,    name: mostViolent.name,    value: mostViolent.kills }         : null,
        safest:          safest        ? { playerId: safest.id,         name: safest.name,         value: safest.deaths }             : null,
        biggestCashout:  biggestCashout? { playerId: biggestCashout.id, name: biggestCashout.name, value: biggestCashout.biggestSingleBank }: null,
      },
      king: { playerId: room.kingId, streak: room.kingStreak },
    };

    room.broadcast(MSG.RESULTS, results);

    // Send each player their chip reward for GREED button
    for (const p of players) {
      room.sendToPlayer(p.id, MSG.CHIPS_UPDATE, {
        chips: p.chips,
        earned: p.pendingChipReward,
      });
    }

    // Back to lobby after results screen
    setTimeout(() => this._returnToLobby(), 12000);
  }

  // ── GREED button ─────────────────────────────────────────
  handleGreedButton(playerId, msg) {
    const player = this.room.playerManager.getPlayer(playerId);
    if (!player) return;
    if (this.room.state !== ROUND_STATES.RESULTS) return;

    const reward  = player.pendingChipReward;
    if (reward <= 0) return;

    player.pendingChipReward = 0; // consume the gamble opportunity

    const jackpot = Math.random() < 0.5;
    const gained  = jackpot ? reward * GAME_CONFIG.GREED_BUTTON_MULTIPLIER : 0;

    if (jackpot) {
      player.chips += gained - reward; // already added reward before, now add extra
    } else {
      player.chips -= reward; // lost the base reward
    }

    this.room.sendToPlayer(playerId, MSG.GREED_RESULT, {
      jackpot,
      base:       reward,
      gained:     jackpot ? gained : 0,
      newChips:   player.chips,
    });
  }

  // ── Return to lobby ───────────────────────────────────────
  _returnToLobby() {
    const room = this.room;
    room.setState(ROUND_STATES.LOBBY);

    // Clear bits
    room.bitManager.bits.clear();
    room.meltdownManager.reset();

    if (room.playerManager.getCount() >= GAME_CONFIG.MIN_PLAYERS_TO_START) {
      this.startLobbyCountdown();
    }
  }

  // ── Snapshot ─────────────────────────────────────────────
  getSnapshot() {
    const remaining = Math.max(
      0,
      GAME_CONFIG.ROUND_DURATION - this.roundTime
    );
    return {
      phase:     this.room.state,
      remaining,
      total:     GAME_CONFIG.ROUND_DURATION,
    };
  }

  destroy() {
    if (this.roundTimer) clearInterval(this.roundTimer);
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
  }
}

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
