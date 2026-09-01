// ============================================================
// GREED.exe - UpgradeMenu
// Shows 3 upgrade options to the local player only.
// Does NOT pause the world — other players keep playing.
// ============================================================

const TIER_COLORS = {
  COMMON:    { border: '#00ff88', bg: 'rgba(0,255,136,.08)', glow: '#00ff88', label: 'COMMON' },
  RARE:      { border: '#00eeff', bg: 'rgba(0,238,255,.10)', glow: '#00eeff', label: 'RARE' },
  HIGH_RISK: { border: '#ff2244', bg: 'rgba(255,34,68,.10)',  glow: '#ff2244', label: '⚠ HIGH RISK' },
};

export class UpgradeMenu {
  constructor(uiRoot, onSelect) {
    this._root     = uiRoot;
    this._onSelect = onSelect;
    this._el       = null;
    this._options  = [];
  }

  show(options) {
    this._options = options;
    this._render();
  }

  hide() {
    this._el?.remove();
    this._el = null;
  }

  _render() {
    this.hide();

    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      pointer-events: all;
      background: rgba(0,0,0,.45);
      backdrop-filter: blur(2px);
      z-index: 30;
      animation: fadeIn .2s ease-out;
    `;

    el.innerHTML = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:.7rem;letter-spacing:.3em;color:rgba(0,255,136,.5);margin-bottom:6px;">
          UPGRADE AVAILABLE
        </div>
        <div style="font-size:1.8rem;font-weight:900;letter-spacing:.15em;color:#00ff88;
          text-shadow:0 0 20px #00ff88;">
          CHOOSE YOUR PATH
        </div>
        <div style="font-size:.65rem;letter-spacing:.15em;color:rgba(0,255,136,.35);margin-top:4px;">
          GAME CONTINUES — DECIDE QUICKLY
        </div>
      </div>
      <div id="upgrade-cards" style="
        display:flex; gap:16px; justify-content:center;
        flex-wrap:wrap; max-width:900px; padding:0 20px;">
      </div>
    `;

    const cards = el.querySelector('#upgrade-cards');
    this._options.forEach(opt => {
      const tc = TIER_COLORS[opt.tier] || TIER_COLORS.COMMON;
      const card = document.createElement('button');
      card.style.cssText = `
        background: ${tc.bg};
        border: 2px solid ${tc.border};
        box-shadow: 0 0 18px ${tc.glow}40, inset 0 0 12px ${tc.glow}10;
        color: #fff;
        font-family: 'Courier New', monospace;
        padding: 22px 24px;
        min-width: 210px; max-width: 240px;
        cursor: pointer;
        text-align: center;
        transition: all .15s;
        position: relative;
        outline: none;
      `;
      card.innerHTML = `
        <div style="font-size:.55rem;letter-spacing:.2em;color:${tc.border};
          margin-bottom:8px;opacity:.8;">${tc.label}</div>
        <div style="font-size:1.1rem;font-weight:900;letter-spacing:.1em;
          color:${tc.border};text-shadow:0 0 10px ${tc.glow};
          margin-bottom:10px;">${opt.name}</div>
        <div style="font-size:.75rem;line-height:1.5;color:rgba(255,255,255,.7);
          letter-spacing:.05em;">${opt.description}</div>
      `;

      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-4px) scale(1.03)';
        card.style.boxShadow = `0 0 30px ${tc.glow}80, inset 0 0 20px ${tc.glow}20`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = `0 0 18px ${tc.glow}40, inset 0 0 12px ${tc.glow}10`;
      });
      card.addEventListener('click', () => {
        this._onSelect(opt.id);
        this.hide();
      });
      cards.appendChild(card);
    });

    // Auto-dismiss after 20s (game continues)
    this._dismissTimer = setTimeout(() => this.hide(), 20000);

    // Progress bar for auto-dismiss
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:0; left:0; height:3px;
      background:rgba(0,255,136,.4);
      width:100%; transform-origin:left;
      animation: shrink 20s linear forwards;
    `;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shrink { from{transform:scaleX(1)} to{transform:scaleX(0)} }
      @keyframes fadeIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
    `;
    document.head.appendChild(style);
    el.appendChild(bar);

    this._root.appendChild(el);
    this._el = el;
  }

  dispose() {
    clearTimeout(this._dismissTimer);
    this.hide();
  }
}
