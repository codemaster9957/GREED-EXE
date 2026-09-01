// ============================================================
// GREED.exe - main.js
// Entry point: connection screen → name entry → game
// ============================================================

import { NetworkClient } from './networking/NetworkClient.js';
import { Game }          from './Game.js';
import { MSG }           from '../../shared/messages.js';

// ── DOM refs ─────────────────────────────────────────────────
const connectScreen   = document.getElementById('connect-screen');
const connectDots     = document.getElementById('connect-dots');
const connectHint     = document.getElementById('connect-hint');
const retryBtn        = document.getElementById('connect-retry-btn');
const nameScreen      = document.getElementById('name-screen');
const nameInput       = document.getElementById('name-input');
const nameSubmitBtn   = document.getElementById('name-submit-btn');

// ── State ─────────────────────────────────────────────────────
let network    = null;
let game       = null;
let playerName = '';
let guestId    = '';
let hasJoined  = false;

// ── Guest ID (localStorage) ───────────────────────────────────
function getOrCreateGuestId() {
  let id = localStorage.getItem('greed_guest_id');
  if (!id) {
    id = _uuid();
    localStorage.setItem('greed_guest_id', id);
  }
  return id;
}

function getSavedName() {
  return localStorage.getItem('greed_player_name') || '';
}

function saveName(name) {
  localStorage.setItem('greed_player_name', name);
}

// ── Dots animation ────────────────────────────────────────────
let _dotsTimer = setInterval(() => {
  if (!connectDots) return;
  const t = (Math.floor(Date.now() / 500) % 4);
  connectDots.textContent = '.'.repeat(t) || '';
}, 500);

// ── Network setup ─────────────────────────────────────────────
function startNetwork() {
  network = new NetworkClient();

  network.onStatusChange((status) => {
    const lines = status.split('\n');
    if (connectHint) connectHint.textContent = lines[1] || '';
    if (connectDots) {
      const first = lines[0] || '';
      const hint  = document.querySelector('.connect-status');
      if (hint) {
        hint.childNodes[0].textContent = first.replace('...', '');
      }
    }

    // Show retry button after extended failure
    const failed = status.includes('attempt 4') || status.includes('attempt 5');
    if (retryBtn) retryBtn.style.display = failed ? 'block' : 'none';
  });

  network.on('__connected__', () => {
    // Connection established — show name screen
    clearInterval(_dotsTimer);
    showNameScreen();
  });

  network.connect();
}

retryBtn?.addEventListener('click', () => {
  retryBtn.style.display = 'none';
  network?.connect();
});

// ── Name screen ───────────────────────────────────────────────
function showNameScreen() {
  connectScreen.style.display = 'none';
  nameScreen.style.display    = 'flex';

  // Pre-fill saved name
  const saved = getSavedName();
  if (nameInput && saved) nameInput.value = saved;
  nameInput?.focus();
  nameInput?.select();
}

function submitName() {
  const raw  = nameInput?.value?.trim() || '';
  playerName = raw.slice(0, 16) || `PLAYER_${_uuid().slice(0, 4)}`;
  guestId    = getOrCreateGuestId();

  saveName(playerName);

  nameScreen.style.display = 'none';
  connectScreen.style.display = 'none';

  // Boot the game
  startGame();
}

nameSubmitBtn?.addEventListener('click', submitName);
nameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitName();
});

// ── Game init ─────────────────────────────────────────────────
function startGame() {
  game = new Game();
  game.init(network);

  // Now join the server
  network.send(MSG.JOIN, {
    name:    playerName,
    guestId: guestId,
  });

  hasJoined = true;
}

// ── Kick off connection ───────────────────────────────────────
startNetwork();

// ── Visibility change (tab switching) ────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause audio context when tab is hidden
    // (AudioContext may auto-suspend anyway)
  }
});

// ── UUID helper ───────────────────────────────────────────────
function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── CSS for meltdown pulse (needs to be in <head>) ────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes meltdown-pulse {
    from { opacity: 0.0; }
    to   { opacity: 1.0; }
  }
`;
document.head.appendChild(style);
