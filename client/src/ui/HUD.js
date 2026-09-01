// ============================================================
// GREED.exe - HUD
// In-game heads-up display. All DOM, injected into #ui-root.
// Held BITS display escalates in intensity as amount grows.
// ============================================================

export class HUD {
  constructor() {
    this._root = document.getElementById('ui-root');
    this._el   = null;
    this._visible = false;

    this._heldBits   = 0;
    this._bankedBits = 0;
    this._isBanking  = false;
    this._bankProgress = 0;
    this._dashReady  = true;
    this._dashCooldownPct = 1;
    this._roundTime  = 180;
    this._phase      = 'PLAYING';
    this._mwName     = null;
    this._kingName   = null;
    this._kingStreak = 0;
    this._rankings   = [];
    this._rivalName  = null;
    this._upgrades   = [];
    this._latency    = 0;
    this._isMostWanted = false;

    this._heldAnimTarget = 0;
    this._heldAnimCurrent = 0;

    this._build();
  }

  // ── Build DOM ────────────────────────────────────────────
  _build() {
    const el = document.createElement('div');
    el.id = 'hud';
    el.style.cssText = `
      position: absolute; inset: 0;
      pointer-events: none;
      font-family: 'Courier New', monospace;
    `;
    el.innerHTML = `
      <!-- TOP CENTER: timer -->
      <div id="hud-timer" style="
        position:absolute; top:14px; left:50%; transform:translateX(-50%);
        text-align:center; pointer-events:none;">
        <div id="hud-phase" style="font-size:0.7rem;letter-spacing:.2em;color:rgba(0,255,136,.5);margin-bottom:2px;"></div>
        <div id="hud-time" style="font-size:2.2rem;font-weight:900;letter-spacing:.1em;color:#00ff88;
          text-shadow:0 0 20px #00ff88;"></div>
      </div>

      <!-- TOP RIGHT: rankings + MW -->
      <div id="hud-rankings" style="
        position:absolute; top:14px; right:16px;
        text-align:right; max-width:200px; pointer-events:none;"></div>

      <!-- TOP LEFT: king / rival -->
      <div id="hud-status" style="
        position:absolute; top:14px; left:16px;
        text-align:left; pointer-events:none;"></div>

      <!-- BOTTOM LEFT: banked bits -->
      <div id="hud-banked" style="
        position:absolute; bottom:28px; left:24px;
        pointer-events:none;">
        <div style="font-size:.65rem;letter-spacing:.2em;color:rgba(0,255,136,.5);margin-bottom:2px;">BANKED BITS</div>
        <div id="hud-banked-val" style="font-size:1.6rem;font-weight:900;color:#00ff88;
          text-shadow:0 0 10px #00ff88;letter-spacing:.05em;">0</div>
      </div>

      <!-- BOTTOM CENTER: held bits (main display — escalates) -->
      <div id="hud-held-wrap" style="
        position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
        text-align:center; pointer-events:none; transition:all .15s;">
        <div id="hud-held-label" style="font-size:.65rem;letter-spacing:.25em;
          color:rgba(0,255,136,.5);margin-bottom:2px;">HELD BITS</div>
        <div id="hud-held-val" style="font-size:2.6rem;font-weight:900;
          letter-spacing:.08em;color:#00ff88;
          text-shadow:0 0 12px #00ff88;
          transition:color .2s, text-shadow .2s;"></div>
        <!-- Banking progress bar -->
        <div id="hud-bank-bar-wrap" style="display:none;margin-top:6px;">
          <div style="font-size:.6rem;letter-spacing:.2em;color:#00ff88;margin-bottom:3px;">BANKING...</div>
          <div style="width:160px;height:6px;background:rgba(0,255,136,.15);border:1px solid rgba(0,255,136,.3);border-radius:3px;overflow:hidden;">
            <div id="hud-bank-bar" style="height:100%;background:#00ff88;width:0%;transition:width .05s;
              box-shadow:0 0 8px #00ff88;"></div>
          </div>
        </div>
      </div>

      <!-- BOTTOM RIGHT: dash cooldown + upgrades -->
      <div id="hud-abilities" style="
        position:absolute; bottom:20px; right:20px;
        text-align:right; pointer-events:none;">
        <div id="hud-upgrades" style="margin-bottom:8px; font-size:.6rem;
          letter-spacing:.12em; color:rgba(0,255,136,.55);"></div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
          <div style="font-size:.6rem;letter-spacing:.15em;color:rgba(0,255,136,.4);">DASH</div>
          <div id="hud-dash-ring" style="
            width:36px;height:36px;border-radius:50%;
            border:2px solid rgba(0,255,136,.3);
            background:conic-gradient(#00ff88 100%, transparent 0%);
            position:relative;display:flex;align-items:center;justify-content:center;">
            <div id="hud-dash-icon" style="width:10px;height:10px;background:#00ff88;
              border-radius:50%;box-shadow:0 0 6px #00ff88;"></div>
          </div>
        </div>
      </div>

      <!-- MOST WANTED self indicator -->
      <div id="hud-mw-self" style="
        display:none; position:absolute; top:70px; left:50%; transform:translateX(-50%);
        text-align:center; pointer-events:none;
        border:2px solid #ff2244; padding:4px 18px;
        background:rgba(255,34,68,.12);
        box-shadow:0 0 20px rgba(255,34,68,.4);
        animation:mw-pulse 1s ease-in-out infinite alternate;">
        <div style="font-size:.65rem;letter-spacing:.2em;color:#ff2244;">YOU ARE</div>
        <div style="font-size:1.1rem;font-weight:900;letter-spacing:.2em;color:#ff2244;
          text-shadow:0 0 12px #ff2244;">MOST WANTED</div>
      </div>

      <!-- RESPAWN countdown -->
      <div id="hud-respawn" style="
        display:none; position:absolute; top:50%; left:50%;
        transform:translate(-50%,-50%); text-align:center; pointer-events:none;">
        <div style="font-size:.8rem;letter-spacing:.3em;color:#ff2244;margin-bottom:8px;">YOU DIED</div>
        <div id="hud-respawn-timer" style="font-size:3.5rem;font-weight:900;color:#ff2244;
          text-shadow:0 0 30px #ff2244;"></div>
      </div>
    `;

    // Inject CSS for animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes mw-pulse {
        from { box-shadow: 0 0 12px rgba(255,34,68,.3); }
        to   { box-shadow: 0 0 30px rgba(255,34,68,.8); }
      }
      @keyframes held-glitch {
        0%   { transform: translateX(0); }
        20%  { transform: translateX(-3px); }
        40%  { transform: translateX(3px); }
        60%  { transform: translateX(-2px); }
        80%  { transform: translateX(2px); }
        100% { transform: translateX(0); }
      }
      @keyframes held-pulse {
        from { transform: translateX(-50%) scale(1); }
        to   { transform: translateX(-50%) scale(1.04); }
      }
      .floating-num { animation: float-up .1s ease-out; }
      @keyframes float-up {
        from { opacity:0; transform:translate(-50%,-50%) scale(.8); }
        to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
      }
    `;
    document.head.appendChild(style);

    this._root.appendChild(el);
    this._el = el;

    // Cache frequent refs
    this._timeEl      = el.querySelector('#hud-time');
    this._phaseEl     = el.querySelector('#hud-phase');
    this._heldValEl   = el.querySelector('#hud-held-val');
    this._heldWrapEl  = el.querySelector('#hud-held-wrap');
    this._heldLabelEl = el.querySelector('#hud-held-label');
    this._bankedValEl = el.querySelector('#hud-banked-val');
    this._bankBarWrap = el.querySelector('#hud-bank-bar-wrap');
    this._bankBar     = el.querySelector('#hud-bank-bar');
    this._rankingsEl  = el.querySelector('#hud-rankings');
    this._statusEl    = el.querySelector('#hud-status');
    this._abilitiesEl = el.querySelector('#hud-abilities');
    this._dashRingEl  = el.querySelector('#hud-dash-ring');
    this._upgradesEl  = el.querySelector('#hud-upgrades');
    this._mwSelfEl    = el.querySelector('#hud-mw-self');
    this._respawnEl   = el.querySelector('#hud-respawn');
    this._respawnTimerEl = el.querySelector('#hud-respawn-timer');
  }

  // ── Public setters ────────────────────────────────────────
  show() { this._el.style.display = 'block'; this._visible = true; }
  hide() { this._el.style.display = 'none';  this._visible = false; }

  setHeldBits(n) {
    this._heldAnimTarget = n;
    this.heldBits = n;
  }

  setBankedBits(n) {
    this._bankedBits = n;
    this._bankedValEl.textContent = n.toLocaleString();
  }

  setBanking(active, progress = 0) {
    this._isBanking   = active;
    this._bankProgress = progress;
    this._bankBarWrap.style.display = active ? 'block' : 'none';
    if (active) this._bankBar.style.width = `${Math.min(100, progress * 100)}%`;
  }

  setTimer(seconds, phase) {
    this._roundTime = seconds;
    this._phase     = phase;

    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    const str = `${m}:${String(s).padStart(2, '0')}`;

    if (phase === 'MELTDOWN') {
      this._timeEl.style.color      = '#ff2244';
      this._timeEl.style.textShadow = `0 0 30px #ff2244, 0 0 60px rgba(255,34,68,.5)`;
      this._phaseEl.textContent     = 'SERVER MELTDOWN';
      this._phaseEl.style.color     = '#ff2244';
      this._timeEl.textContent      = `${seconds}s`;
      if (seconds <= 10) {
        this._timeEl.style.animation = 'mw-pulse .5s ease-in-out infinite alternate';
      }
    } else {
      this._timeEl.style.color      = seconds <= 30 ? '#ffd700' : '#00ff88';
      this._timeEl.style.textShadow = `0 0 20px ${seconds <= 30 ? '#ffd700' : '#00ff88'}`;
      this._phaseEl.textContent     = '';
      this._timeEl.textContent      = str;
      this._timeEl.style.animation  = '';
    }
  }

  setRankings(rankings) {
    this._rankings = rankings;
    if (!this._rankingsEl) return;

    const lines = rankings.slice(0, 5).map((r, i) => {
      const isMe = r.isMe;
      const color = i === 0 ? '#ffd700' : isMe ? '#00ff88' : 'rgba(0,255,136,.55)';
      return `<div style="font-size:.7rem;letter-spacing:.08em;color:${color};
        text-shadow:${isMe ? `0 0 8px ${color}` : 'none'};
        margin-bottom:2px;">
        ${i + 1}. ${r.name.slice(0, 10)} <span style="color:${color};opacity:.7">${r.bankedBits}</span>
      </div>`;
    }).join('');

    this._rankingsEl.innerHTML = lines;
  }

  setMostWanted(name) {
    this._mwName = name;
    const html = name
      ? `<div style="font-size:.6rem;letter-spacing:.15em;color:#ff2244;margin-bottom:3px;">MOST WANTED</div>
         <div style="font-size:.85rem;font-weight:900;letter-spacing:.1em;color:#ff2244;
           text-shadow:0 0 12px #ff2244;">${name.slice(0, 14)}</div>`
      : '';
    this._rankingsEl.insertAdjacentHTML('afterbegin', html);
  }

  setMostWantedSelf(active) {
    this._isMostWanted = active;
    this._mwSelfEl.style.display = active ? 'block' : 'none';
  }

  setKing(name, streak) {
    this._kingName   = name;
    this._kingStreak = streak;
    this._updateStatusPanel();
  }

  setRival(name) {
    this._rivalName = name;
    this._updateStatusPanel();
  }

  _updateStatusPanel() {
    let html = '';
    if (this._kingName) {
      html += `<div style="font-size:.6rem;letter-spacing:.15em;color:#ffd700;margin-bottom:4px;">
        KING: <span style="font-weight:900;">${this._kingName.slice(0, 12)}</span>
        ${this._kingStreak > 1 ? `<span style="color:#ff8800;"> ×${this._kingStreak}</span>` : ''}
      </div>`;
    }
    if (this._rivalName) {
      html += `<div style="font-size:.6rem;letter-spacing:.15em;color:#ff8800;margin-bottom:2px;">
        RIVAL: <span style="font-weight:900;">${this._rivalName.slice(0, 12)}</span>
      </div>`;
    }
    this._statusEl.innerHTML = html;
  }

  setDashCooldown(pct) {
    // pct = 0 (on cooldown) → 1 (ready)
    this._dashCooldownPct = pct;
    const deg = Math.round(pct * 360);
    const color  = pct >= 1 ? '#00ff88' : 'rgba(0,255,136,.3)';
    const fill   = pct >= 1 ? '#00ff88' : `rgba(0,255,136,.7)`;
    this._dashRingEl.style.background =
      `conic-gradient(${fill} ${deg}deg, rgba(0,255,136,.1) ${deg}deg)`;
    this._dashRingEl.style.borderColor = color;
  }

  setUpgrades(upgrades) {
    this._upgrades = upgrades;
    if (!this._upgradesEl) return;
    this._upgradesEl.innerHTML = upgrades.slice(0, 5).map(u =>
      `<div style="margin-bottom:1px;color:rgba(0,255,136,.6);">${u.toUpperCase().replace(/_/g,' ')}</div>`
    ).join('');
  }

  showRespawn(secondsLeft) {
    this._respawnEl.style.display = 'block';
    this._respawnTimerEl.textContent = secondsLeft > 0 ? secondsLeft.toFixed(1) : '';
  }

  hideRespawn() {
    this._respawnEl.style.display = 'none';
  }

  setLatency(ms) {
    this._latency = ms;
  }

  // ── Per-frame update ─────────────────────────────────────
  update(dt) {
    // Animate held bits counter (smooth tick-up)
    const target  = this._heldAnimTarget;
    const current = this._heldAnimCurrent;
    if (Math.abs(target - current) > 0.5) {
      this._heldAnimCurrent += (target - current) * Math.min(1, dt * 14);
    } else {
      this._heldAnimCurrent = target;
    }

    const display = Math.round(this._heldAnimCurrent);
    this._heldValEl.textContent = display.toLocaleString();

    // Held bits escalation styling
    if (display >= 500) {
      this._heldValEl.style.color      = '#ff2244';
      this._heldValEl.style.textShadow = '0 0 20px #ff2244, 0 0 40px rgba(255,34,68,.6)';
      this._heldValEl.style.fontSize   = '3.2rem';
      this._heldLabelEl.style.color    = '#ff2244';
      this._heldWrapEl.style.animation = 'held-glitch 0.4s ease infinite';
    } else if (display >= 250) {
      this._heldValEl.style.color      = '#ff8800';
      this._heldValEl.style.textShadow = '0 0 16px #ff8800, 0 0 30px rgba(255,136,0,.5)';
      this._heldValEl.style.fontSize   = '3rem';
      this._heldLabelEl.style.color    = '#ff8800';
      this._heldWrapEl.style.animation = 'held-pulse .8s ease infinite alternate';
    } else if (display >= 100) {
      this._heldValEl.style.color      = '#ffd700';
      this._heldValEl.style.textShadow = '0 0 14px #ffd700';
      this._heldValEl.style.fontSize   = '2.8rem';
      this._heldLabelEl.style.color    = '#ffd700';
      this._heldWrapEl.style.animation = '';
    } else {
      this._heldValEl.style.color      = '#00ff88';
      this._heldValEl.style.textShadow = '0 0 10px #00ff88';
      this._heldValEl.style.fontSize   = '2.6rem';
      this._heldLabelEl.style.color    = 'rgba(0,255,136,.5)';
      this._heldWrapEl.style.animation = '';
    }
  }

  dispose() {
    this._el?.remove();
  }
}
