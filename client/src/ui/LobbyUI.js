// ============================================================
// GREED.exe - LobbyUI
// Pre-match lobby: player list, countdown, king, leaderboard,
// controls reference
// ============================================================

export class LobbyUI {
  constructor(uiRoot) {
    this._root = uiRoot;
    this._el   = null;
  }

  show(data = {}) {
    this._render(data);
  }

  update(data = {}) {
    if (!this._el) { this._render(data); return; }

    // Hot-update countdown only
    const cdEl = this._el.querySelector('#lobby-cd');
    if (cdEl) {
      if (data.countdown > 0) {
        cdEl.textContent = `STARTING IN ${data.countdown}s`;
        cdEl.style.color  = data.countdown <= 3 ? '#ff2244' : '#ffd700';
      } else if (data.countdown === -1) {
        cdEl.textContent = 'WAITING FOR PLAYERS...';
        cdEl.style.color  = 'rgba(0,255,136,.4)';
      } else {
        cdEl.textContent = '';
      }
    }

    // Player list
    const plEl = this._el.querySelector('#lobby-players');
    if (plEl && data.players) {
      plEl.innerHTML = _renderPlayerList(data.players, data.myId, data.kingId);
    }
  }

  hide() {
    this._el?.remove();
    this._el = null;
  }

  _render(data) {
    this.hide();
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0;
      display:flex; align-items:center; justify-content:center;
      pointer-events:none;
      z-index:25;
    `;

    el.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
        max-width:860px;
        width:100%;
        padding:0 20px;
        pointer-events:none;
      ">
        <!-- LEFT: status + players -->
        <div>
          <!-- King display -->
          <div id="lobby-king" style="
            margin-bottom:16px;
            padding:12px 16px;
            border:1px solid rgba(255,215,0,.35);
            background:rgba(255,215,0,.05);
            ${data.kingName ? '' : 'display:none;'}
          ">
            <div style="font-size:.6rem;letter-spacing:.2em;color:rgba(255,215,0,.5);margin-bottom:3px;">
              CURRENT KING
            </div>
            <div style="font-size:1.1rem;font-weight:900;letter-spacing:.1em;color:#ffd700;
              text-shadow:0 0 12px #ffd700;">
              👑 ${data.kingName || ''}
              ${data.kingStreak > 1
                ? `<span style="font-size:.7rem;color:#ff8800;"> STREAK ×${data.kingStreak}</span>`
                : ''}
            </div>
          </div>

          <!-- Countdown -->
          <div id="lobby-cd" style="
            font-size:1rem;font-weight:900;letter-spacing:.2em;
            color:#ffd700;text-shadow:0 0 14px #ffd700;
            margin-bottom:12px;
            min-height:28px;
          ">${data.countdown > 0 ? `STARTING IN ${data.countdown}s` : 'WAITING FOR PLAYERS...'}</div>

          <!-- Player list -->
          <div style="font-size:.6rem;letter-spacing:.2em;
            color:rgba(0,255,136,.35);margin-bottom:6px;">
            PLAYERS IN LOBBY (${(data.players || []).length} / 12)
          </div>
          <div id="lobby-players" style="
            max-height:220px;overflow-y:auto;
          ">
            ${_renderPlayerList(data.players || [], data.myId, data.kingId)}
          </div>
        </div>

        <!-- RIGHT: controls + tip -->
        <div>
          <div style="
            padding:14px 16px;
            border:1px solid rgba(0,255,136,.15);
            background:rgba(0,0,0,.3);
            margin-bottom:12px;
          ">
            <div style="font-size:.6rem;letter-spacing:.2em;color:rgba(0,255,136,.4);
              margin-bottom:10px;">HOW TO PLAY</div>
            ${_controlsHtml()}
          </div>

          <div style="
            padding:10px 14px;
            border:1px solid rgba(255,34,68,.2);
            background:rgba(255,34,68,.04);
            font-size:.7rem;line-height:1.7;letter-spacing:.06em;
            color:rgba(255,255,255,.55);
          ">
            <span style="color:#ff2244;font-weight:900;">THE RULE:</span>
            Collect BITS. Bank them before someone knocks them out of you.
            The greedier you are, the more dangerous you become — and the bigger the target on your back.
          </div>
        </div>
      </div>
    `;

    this._root.appendChild(el);
    this._el = el;
  }

  dispose() {
    this.hide();
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _renderPlayerList(players, myId, kingId) {
  if (!players.length) {
    return `<div style="font-size:.7rem;color:rgba(0,255,136,.25);letter-spacing:.1em;">
      NO OTHER PLAYERS YET
    </div>`;
  }

  return players.map(p => {
    const isMe   = p.id === myId;
    const isKing = p.id === kingId;
    const color  = isMe ? '#00ff88' : 'rgba(255,255,255,.6)';
    return `
      <div style="
        display:flex;align-items:center;gap:8px;
        padding:5px 8px;margin-bottom:2px;
        background:${isMe ? 'rgba(0,255,136,.06)' : 'transparent'};
        border-left:${isMe ? '2px solid #00ff88' : '2px solid transparent'};
        font-size:.75rem;letter-spacing:.06em;color:${color};
      ">
        ${isKing ? '<span style="margin-right:2px;">👑</span>' : ''}
        ${p.name.slice(0, 16)}
        ${isMe ? '<span style="font-size:.55rem;color:rgba(0,255,136,.4);margin-left:4px;">(YOU)</span>' : ''}
        ${p.chips ? `<span style="margin-left:auto;font-size:.6rem;color:rgba(255,215,0,.5);">${p.chips}◆</span>` : ''}
      </div>
    `;
  }).join('');
}

function _controlsHtml() {
  const bindings = [
    ['WASD',         'Move'],
    ['MOUSE',        'Look around'],
    ['CLICK',        'Attack'],
    ['SPACE',        'Jump'],
    ['SHIFT',        'Sprint'],
    ['F / Q',        'Dash'],
    ['Walk into BANK', 'Auto-bank bits'],
    ['ESC',          'Release mouse'],
  ];

  return bindings.map(([key, desc]) => `
    <div style="display:flex;justify-content:space-between;
      padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);">
      <span style="font-size:.65rem;letter-spacing:.08em;color:#00ff88;
        font-weight:900;">${key}</span>
      <span style="font-size:.65rem;letter-spacing:.06em;
        color:rgba(255,255,255,.45);">${desc}</span>
    </div>
  `).join('');
}
