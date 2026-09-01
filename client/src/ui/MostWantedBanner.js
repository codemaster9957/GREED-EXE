// ============================================================
// GREED.exe - MostWantedBanner
// Full-screen dramatic announcement when Most Wanted activates
// ============================================================

export class MostWantedBanner {
  constructor(uiRoot) {
    this._root = uiRoot;
  }

  flash(name, heldBits, killReward) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      pointer-events:none; z-index:45;
      animation:mwBannerIn .2s ease-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes mwBannerIn {
        from{opacity:0;transform:scale(1.08)} to{opacity:1;transform:scale(1)}
      }
      @keyframes mwScan {
        0%  {transform:translateY(-100%)}
        100%{transform:translateY(200vh)}
      }
    `;
    document.head.appendChild(style);

    el.innerHTML = `
      <div style="
        padding:20px 40px; text-align:center;
        border-top: 3px solid #ff2244;
        border-bottom: 3px solid #ff2244;
        background:rgba(0,0,0,.7);
        box-shadow:0 0 60px rgba(255,34,68,.4), inset 0 0 40px rgba(255,34,68,.08);
        position:relative; overflow:hidden;
      ">
        <!-- Scan line effect -->
        <div style="
          position:absolute;top:0;left:0;right:0;height:3px;
          background:linear-gradient(90deg,transparent,#ff2244,transparent);
          animation:mwScan 1.5s linear;pointer-events:none;
        "></div>

        <div style="font-size:.65rem;letter-spacing:.4em;
          color:rgba(255,34,68,.7);margin-bottom:6px;">
          ⚠ SERVER ALERT ⚠
        </div>
        <div style="font-size:1.5rem;font-weight:900;letter-spacing:.3em;
          color:#ff2244;text-shadow:0 0 30px #ff2244,0 0 60px rgba(255,34,68,.5);
          margin-bottom:6px;">
          MOST WANTED
        </div>
        <div style="font-size:2rem;font-weight:900;letter-spacing:.15em;
          color:#ffffff;text-shadow:0 0 20px #ff2244;margin-bottom:8px;">
          ${name.slice(0, 16).toUpperCase()}
        </div>
        <div style="font-size:.8rem;letter-spacing:.12em;
          color:rgba(255,255,255,.6);">
          ${heldBits} HELD BITS &nbsp;·&nbsp;
          <span style="color:#ffd700;">KILL REWARD: +${killReward} BITS</span>
        </div>
      </div>
    `;

    this._root.appendChild(el);

    // Auto-remove after 3.5s
    setTimeout(() => {
      el.style.transition = 'opacity .4s';
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 400);
    }, 3500);
  }
}
