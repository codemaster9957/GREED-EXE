import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatManager } from '../combat/CombatManager.js';
import { GAME_CONFIG, PLAYER_STATES, ROUND_STATES } from '../../shared/constants.js';

function makeFixture() {
  const attacker = {
    id: 'attacker',
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    state: PLAYER_STATES.ALIVE,
    heldBits: 0,
    kills: 0,
    mostWantedKills: 0,
    lastAttackTime: 0,
    rivalId: 'target',
    rivalData: {},
    hasUpgrade: () => false,
    getKnockbackDealt: () => GAME_CONFIG.ATTACK_KNOCKBACK,
    addHeldBits(amount) { this.heldBits += amount; },
  };

  const target = {
    id: 'target',
    name: 'Target',
    x: 1,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    state: PLAYER_STATES.ALIVE,
    heldBits: 0,
    isMostWanted: true,
    shieldUntil: 0,
    getKnockbackReceived: () => 1,
    die() {
      this.state = PLAYER_STATES.DEAD;
      return 0;
    },
  };

  let mostWantedRefreshes = 0;

  const room = {
    id: 'TEST',
    state: ROUND_STATES.PLAYING,
    kingId: target.id,
    playerManager: {
      getPlayer(id) {
        if (id === attacker.id) return attacker;
        if (id === target.id) return target;
        return null;
      },
      getAllPlayers() { return [attacker, target]; },
      updateMostWanted() { mostWantedRefreshes++; },
    },
    bitManager: { scatterBits() {} },
    broadcast() {},
    sendToPlayer() {},
  };

  return {
    attacker,
    target,
    room,
    combat: new CombatManager(room),
    getMostWantedRefreshes: () => mostWantedRefreshes,
  };
}

test('kill-only bonuses are not granted on a normal hit', () => {
  const { attacker, combat } = makeFixture();

  combat.handleAttack(attacker.id, {});

  assert.equal(attacker.heldBits, 0);
  assert.equal(attacker.mostWantedKills, 0);
});

test('kill-only bonuses are granted once when the target actually dies', () => {
  const { attacker, combat, getMostWantedRefreshes } = makeFixture();

  combat.killPlayer('target', attacker.id, 'pit');

  const expectedBits =
    GAME_CONFIG.MOST_WANTED_KILL_BONUS +
    GAME_CONFIG.KING_KILL_BONUS +
    GAME_CONFIG.CHIPS_RIVAL_KILL;

  assert.equal(attacker.heldBits, expectedBits);
  assert.equal(attacker.kills, 1);
  assert.equal(attacker.mostWantedKills, 1);
  assert.equal(getMostWantedRefreshes(), 1);
});
