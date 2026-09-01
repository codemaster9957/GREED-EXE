// ============================================================
// GREED.exe - UpgradeManager
// Offers 3 random upgrades every 30 seconds; validates picks
// ============================================================

import { UPGRADES, UPGRADE_MAP } from './UpgradeDefinitions.js';
import { GAME_CONFIG, ROUND_STATES } from '../../shared/constants.js';
import { MSG } from '../../shared/messages.js';

export class UpgradeManager {
  constructor(room) {
    this.room = room;
    // playerId → Set of upgrade offer ids currently pending
    this._pendingOffers = new Map();
    // Interval timer for offering upgrades
    this._intervalTimer = null;
  }

  // ── Start offering upgrades at UPGRADE_INTERVAL ────────
  startOfferCycle(roundStartTime) {
    if (this._intervalTimer) clearInterval(this._intervalTimer);

    let elapsed = 0;
    this._intervalTimer = setInterval(() => {
      elapsed += GAME_CONFIG.UPGRADE_INTERVAL;
      if (
        this.room.state === ROUND_STATES.PLAYING ||
        this.room.state === ROUND_STATES.MELTDOWN
      ) {
        this._offerToAllPlayers();
      }
    }, GAME_CONFIG.UPGRADE_INTERVAL * 1000);
  }

  stopOfferCycle() {
    if (this._intervalTimer) clearInterval(this._intervalTimer);
    this._intervalTimer = null;
    this._pendingOffers.clear();
  }

  // ── Offer 3 random upgrades to every alive player ────────
  _offerToAllPlayers() {
    for (const player of this.room.playerManager.getAllPlayers()) {
      this._offerToPlayer(player.id);
    }
  }

  _offerToPlayer(playerId) {
    const player = this.room.playerManager.getPlayer(playerId);
    if (!player) return;

    const options = _pickThreeUpgrades(player.upgrades);
    this._pendingOffers.set(playerId, new Set(options.map(u => u.id)));

    this.room.sendToPlayer(playerId, MSG.UPGRADE_OPTIONS, { options });
  }

  // ── Handle player selection ───────────────────────────────
  handleSelection(playerId, msg) {
    const { upgradeId } = msg;
    const player = this.room.playerManager.getPlayer(playerId);
    if (!player) return;

    const pending = this._pendingOffers.get(playerId);
    if (!pending || !pending.has(upgradeId)) {
      // Was not offered this upgrade — reject
      return;
    }

    if (!UPGRADE_MAP[upgradeId]) return;

    player.addUpgrade(upgradeId);
    this._pendingOffers.delete(playerId);

    // Tell the whole room so they can see the upgrade visually
    this.room.broadcast(MSG.UPGRADE_APPLIED, {
      playerId,
      upgradeId,
      upgradeName: UPGRADE_MAP[upgradeId].name,
    });
  }

  destroy() {
    this.stopOfferCycle();
  }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Pick 3 distinct upgrades, weighted by tier and availability.
 * Players can't be offered an upgrade they already own.
 */
function _pickThreeUpgrades(playerUpgrades) {
  const owned    = new Set(playerUpgrades);
  const eligible = UPGRADES.filter(u => !owned.has(u.id));

  if (eligible.length <= 3) return eligible;

  // Build weighted pool
  const pool = [];
  for (const u of eligible) {
    for (let i = 0; i < (u.weight || 1); i++) pool.push(u);
  }

  const chosen = [];
  const usedIds = new Set();

  let attempts = 0;
  while (chosen.length < Math.min(3, eligible.length) && attempts < 200) {
    attempts++;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!usedIds.has(pick.id)) {
      usedIds.add(pick.id);
      chosen.push({
        id:          pick.id,
        name:        pick.name,
        description: pick.description,
        tier:        pick.tier,
      });
    }
  }

  return chosen;
}
