// ============================================================
// GREED.exe - ResultsScreen
// End-of-round results + awards + GREED button gamble
// ============================================================

export class ResultsScreen {
  constructor(uiRoot, network) {
    this._root    = uiRoot;
    this._network = network;
    this._el      = null;
    this._myId    = null;
    this._greedUsed = false;
  }

  setPlayerId(id) { this._myId = id; }

  show(results, chipReward, audio) {
    this._greedUsed = false;
    this._render(results, chipReward, audio);
  }

  hide() {
    this._el?.remove();
    this._el = null;
  }

  showGreedResult(data, audio) {
    const el = this._el?.querySelector('#greed-result-area');
    if (!el) return;

    if (data.jackpot) {
      audio?.play('jackpot');
      el.innerHTML = `
        <div style="animation:jackpot-flash .3s steps(1) infinite;
          font-size:2rem;font-weight:900;letter-spacing:.2em;
          color:#ffd700;text-shadow:0 0 40px #ffd700,0 0 80px rgba(255,215,0,.5);
          margin-bottom:8px;">JACKPOT!</div>
        <div style="font-size:1.1rem;color:#ffd700;letter-spacing:.1em;">
          +${data.gained} CHIPS
        </div>
        <div style="font-size:.7rem;color:rgba(255,215,0,.5);margin-top:6px;letter-spacing:.15em;">
          NEW TOTAL: ${data.newChips} CHIPS
        </div>
      `;
    } else {
      audio?.play('bust');
      el.innerHTML = `
        <div style="font-size:2rem;font-weight:900;letter-spacing:.2em;
          color:#ff2244;text-shadow:0 0 30px #ff2244;margin-bottom:8px;">BUST.</div>
        <div style="font-size:.9rem;color:rgba(255,34,68,.7);letter-spacing:.1em;">
          0 CHIPS. NOTHING.
        </div>
        <div style="font-size:.7rem;color:rgba(255,34,68,.4);margin-top:6px;letter-spacing:.15em;">
          RUN IT AGAIN NEXT ROUND
        </div>
      `;
    }
  }

  _render(results, chipReward, audio) {
    this.hide();

    const myId   = this._myId;
    const ranked = results.ranked || [];
    const awards = results.awards || {};
    const king   = results.king;

    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
      background:rgba(0,0,0,.88);
      padding:30px 20px 20px;
      overflow-y:auto;
      pointer-events:all;
      z-index:40;
      animation:slideUp .35s ease-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from{opacity:0;transform:translateY(30px)}
        to{opacity:1;transform:translateY(0)}
      }
      @keyframes jackpot-flash {
        0%  {filter:brightness(1)}
        50% {filter:brightness(2.5) hue-rotate(30deg)}
        100%{filter:brightness(1)}
      }
      @keyframes greed-spin {
        0%  { content:'TAKE'; }
        25% { content:'GREED'; }
        50% { content:'TAKE'; }
      }
      .result-row:hover { background:rgba(0,255,136,.05)!important; }
    `;
    document.head.appendChild(style);

    // ── Header ──────────────────────────────────────────────
    let html = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:.7rem;letter-spacing:.3em;color:rgba(0,255,136,.4);margin-bottom:4px;">
          ROUND OVER
        </div>
        <div style="font-size:2.2rem;font-weight:900;letter-spacing:.12em;
          color:#00ff88;text-shadow:0 0 30px #00ff88;">
          RESULTS
        </div>
    `;
    if (king?.playerId) {
      html += `<div style="font-size:.75rem;letter-spacing:.15em;color:#ffd700;margin-top:6px;">
        👑 NEW KING: ${king.name || '???'}
        ${king.streak > 1 ? `<span style="color:#ff8800;"> STREAK ×${king.streak}</span>` : ''}
      </div>`;
    }
    html += `</div>`;

    // ── Rankings table ───────────────────────────────────────
    html += `
      <div style="width:100%;max-width:700px;margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:40px 1fr 90px 70px 60px 60px;
          gap:8px;padding:6px 10px;
          font-size:.6rem;letter-spacing:.12em;color:rgba(0,255,136,.4);
          border-bottom:1px solid rgba(0,255,136,.15);margin-bottom:4px;">
          <div>#</div><div>NAME</div><div style="text-align:right;">BANKED</div>
          <div style="text-align:right;">KILLS</div>
          <div style="text-align:right;">STOLEN</div>
          <div style="text-align:right;">CHIPS</div>
        </div>
    `;

    ranked.forEach((r) => {
      const isMe   = r.playerId === myId;
      const rank1  = r.rank === 1;
      const color  = rank1 ? '#ffd700' : isMe ? '#00ff88' : 'rgba(255,255,255,.7)';
      const bgCol  = isMe ? 'rgba(0,255,136,.06)' : 'transparent';
      const medal  = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank;

      html += `
        <div class="result-row" style="display:grid;
          grid-template-columns:40px 1fr 90px 70px 60px 60px;
          gap:8px;padding:8px 10px;
          background:${bgCol};
          border-bottom:1px solid rgba(255,255,255,.04);
          font-size:.8rem;letter-spacing:.06em;color:${color};
          font-weight:${isMe || rank1 ? '900' : '400'};
          ${rank1 ? `text-shadow:0 0 10px #ffd700;` : ''}">
          <div>${medal}</div>
          <div>${r.name.slice(0, 14)} ${isMe ? '<span style="font-size:.55rem;color:rgba(0,255,136,.5);">(YOU)</span>' : ''}</div>
          <div style="text-align:right;">${r.bankedBits.toLocaleString()}</div>
          <div style="text-align:right;">${r.kills}</div>
          <div style="text-align:right;">${r.stolen.toLocaleString()}</div>
          <div style="text-align:right;color:#ffd700;">+${r.chips}</div>
        </div>
      `;
    });
    html += `</div>`;

    // ── Awards ───────────────────────────────────────────────
    const awardDefs = [
      { key: 'greediest',      icon: '🤑', label: 'GREEDIEST PLAYER',  fmt: v => `${v} HELD` },
      { key: 'biggestFumble',  icon: '💸', label: 'BIGGEST FUMBLE',    fmt: v => `-${v} BITS` },
      { key: 'masterThief',    icon: '🦝', label: 'MASTER THIEF',      fmt: v => `${v} STOLEN` },
      { key: 'mostViolent',    icon: '👊', label: 'MOST VIOLENT',      fmt: v => `${v} KILLS` },
      { key: 'safest',         icon: '🐢', label: 'SAFEST PLAYER',     fmt: v => `${v} DEATHS` },
      { key: 'biggestCashout', icon: '💰', label: 'BIGGEST CASHOUT',   fmt: v => `+${v} BANKED` },
    ];

    const validAwards = awardDefs.filter(a => awards[a.key]?.playerId);
    if (validAwards.length > 0) {
      html += `
        <div style="width:100%;max-width:700px;margin-bottom:20px;">
          <div style="font-size:.6rem;letter-spacing:.25em;color:rgba(0,255,136,.35);
            margin-bottom:10px;text-align:center;">AWARDS</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
      `;
      validAwards.forEach(a => {
        const award = awards[a.key];
        const isMe  = award.playerId === myId;
        html += `
          <div style="background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
            padding:10px 14px;text-align:center;min-width:140px;
            ${isMe ? 'border-color:#ffd700;box-shadow:0 0 12px rgba(255,215,0,.2);' : ''}">
            <div style="font-size:1.4rem;margin-bottom:4px;">${a.icon}</div>
            <div style="font-size:.55rem;letter-spacing:.15em;color:rgba(0,255,136,.45);
              margin-bottom:3px;">${a.label}</div>
            <div style="font-size:.8rem;font-weight:900;color:${isMe ? '#ffd700' : '#fff'};
              letter-spacing:.06em;">${award.name.slice(0, 12)}</div>
            <div style="font-size:.65rem;color:rgba(255,255,255,.45);margin-top:2px;">
              ${a.fmt(award.value)}
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // ── GREED button ─────────────────────────────────────────
    if (chipReward > 0) {
      html += `
        <div style="text-align:center;padding:20px;
          border:1px solid rgba(255,215,0,.3);
          background:rgba(255,215,0,.05);
          max-width:420px;width:100%;margin-bottom:16px;">
          <div style="font-size:.65rem;letter-spacing:.25em;color:rgba(255,215,0,.5);margin-bottom:6px;">
            ROUND REWARD
          </div>
          <div style="font-size:1.8rem;font-weight:900;color:#ffd700;
            text-shadow:0 0 20px #ffd700;letter-spacing:.1em;margin-bottom:16px;">
            ${chipReward} CHIPS
          </div>
          <div style="display:flex;gap:12px;justify-content:center;margin-bottom:12px;">
            <button id="take-btn" style="
              padding:12px 32px;
              background:rgba(0,255,136,.12);
              border:2px solid #00ff88;
              color:#00ff88;
              font-family:'Courier New',monospace;
              font-size:.9rem;font-weight:900;
              letter-spacing:.15em;cursor:pointer;
              transition:all .15s;">
              TAKE ${chipReward}
            </button>
            <button id="greed-btn" style="
              padding:12px 32px;
              background:rgba(255,34,68,.12);
              border:2px solid #ff2244;
              color:#ff2244;
              font-family:'Courier New',monospace;
              font-size:.9rem;font-weight:900;
              letter-spacing:.15em;cursor:pointer;
              transition:all .15s;">
              GREED
            </button>
          </div>
          <div style="font-size:.6rem;color:rgba(255,255,255,.25);letter-spacing:.1em;">
            GREED: 50% CHANCE ×2 / 50% CHANCE ZERO
          </div>
          <div id="greed-result-area" style="margin-top:12px;min-height:40px;"></div>
        </div>
      `;
    }

    html += `
      <div style="font-size:.6rem;letter-spacing:.2em;color:rgba(0,255,136,.25);
        text-align:center;margin-top:8px;">
        NEXT ROUND STARTING SOON...
      </div>
    `;

    el.innerHTML = html;

    // Button handlers
    const takeBtn  = el.querySelector('#take-btn');
    const greedBtn = el.querySelector('#greed-btn');

    if (takeBtn) {
      takeBtn.addEventListener('mouseenter', () => {
        takeBtn.style.background = 'rgba(0,255,136,.25)';
      });
      takeBtn.addEventListener('mouseleave', () => {
        takeBtn.style.background = 'rgba(0,255,136,.12)';
      });
      takeBtn.addEventListener('click', () => {
        takeBtn.disabled = true;
        greedBtn && (greedBtn.disabled = true);
        takeBtn.textContent = '✓ TAKEN';
        audio?.play('bank_complete');
      });
    }

    if (greedBtn) {
      greedBtn.addEventListener('mouseenter', () => {
        greedBtn.style.background = 'rgba(255,34,68,.25)';
      });
      greedBtn.addEventListener('mouseleave', () => {
        greedBtn.style.background = 'rgba(255,34,68,.12)';
      });
      greedBtn.addEventListener('click', () => {
        if (this._greedUsed) return;
        this._greedUsed = true;
        greedBtn.disabled = true;
        takeBtn && (takeBtn.disabled = true);

        // Animate spin before result
        audio?.play('greed_spin');
        const resultArea = el.querySelector('#greed-result-area');
        if (resultArea) {
          resultArea.innerHTML = `<div style="font-size:1rem;color:#ffd700;
            letter-spacing:.2em;animation:jackpot-flash .2s steps(1) infinite;">
            SPINNING...
          </div>`;
        }

        // Escalate audio during spin
        let spinCount = 0;
        const spinInterval = setInterval(() => {
          spinCount++;
          audio?.play('greed_spin', { freq: 200 + spinCount * 80 });
          if (spinCount >= 8) clearInterval(spinInterval);
        }, 120);

        // Tell server
        setTimeout(() => {
          this._network.send('GREED_BUTTON', {});
        }, 800);
      });
    }

    this._root.appendChild(el);
    this._el = el;
  }

  dispose() {
    this.hide();
  }
}
