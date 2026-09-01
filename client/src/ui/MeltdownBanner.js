// ============================================================
// GREED.exe - MeltdownBanner
// Full-screen SERVER MELTDOWN announcement
// ============================================================

export class MeltdownBanner {
  constructor(uiRoot) {
    this._root = uiRoot;
  }

  show() {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      pointer-events:none; z-index:45;
      background:radial-gradient(ellipse at center, rgba(255,34,0,.22) 0%, transparent 70%);
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes meltIn  { from{opacity:0;transform:scale(1.15)} to{opacity:1;transform:scale(1)} }
      @keyframes meltGlitch {
        0%  {transform:translate(0)}
        10% {transform:translate(-4px, 2px)}
        20% {transform:translate(4px,-2px)}
        30% {transform:translate(-3px, 3px)}
        40% {transform:translate(3px,-1px)}
        50% {transform:translate(0)}
        100%{transform:translate(0)}
      }
    `;
    document.head.appendChild(style);

    el.innerHTML = `
      <div style="text-align:center;animation:meltIn .3s ease-out;">
        <div style="font-size:.7rem;letter-spacing:.5em;
          color:rgba(255,68,0,.7);margin-bottom:8px;
          animation:meltGlitch 2s ease infinite;">
          ⚠ CRITICAL ALERT ⚠
        </div>
        <div style="font-size:clamp(2.5rem,7vw,4.5rem);font-weight:900;
          letter-spacing:.2em;color:#ff2200;
          text-shadow:0 0 40px #ff2200, 0 0 80px rgba(255,34,0,.5),
            0 0 120px rgba(255,34,0,.3);
          animation:meltGlitch 1.5s ease infinite;">
          SERVER MELTDOWN
        </div>
        <div style="font-size:.9rem;letter-spacing:.2em;color:rgba(255,255,255,.6);
          margin-top:10px;">
          BIT VALUES ×3 &nbsp;·&nbsp; BANKS CLOSING &nbsp;·&nbsp; PLATFORMS COLLAPSING
        </div>
      </div>
    `;

    this._root.appendChild(el);

    // Fade out after 4s
    setTimeout(() => {
      el.style.transition = 'opacity .6s';
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 700);
    }, 4000);
  }
}
