// ============================================================
// GREED.exe - AudioManager
// Web Audio API — procedural sounds (no asset dependencies).
// All sounds are synthesized so the game works instantly
// without any audio files to download.
// ============================================================

export class AudioManager {
  constructor() {
    this._ctx     = null;
    this._master  = null;
    this._music   = null;
    this._sfxGain = null;
    this._uiGain  = null;
    this._musicGain = null;

    this.volumes = {
      master: 0.7,
      music:  0.25,
      sfx:    0.8,
      ui:     0.9,
    };

    this._musicOscillators = [];
    this._meltdownMusic    = false;
    this._musicStarted     = false;

    // Sound cooldowns to prevent infinite overlap
    this._lastPlayed = {};
    this._cooldowns  = {
      bit_pickup:       80,
      bit_pickup_large: 200,
      attack_swing:     100,
      hit:              80,
      hit_received:     120,
      land:             150,
      jump:             100,
      dash:             200,
      bank_progress:    500,
      bank_complete:    0,
      bank_cancel:      0,
      death:            0,
      respawn:          0,
      most_wanted:      0,
      upgrade:          0,
      meltdown:         0,
      countdown:        900,
      victory:          0,
      king:             0,
      greed_spin:       100,
      jackpot:          0,
      bust:             0,
    };
  }

  // ── Init (must be called after a user gesture) ────────────
  init() {
    if (this._ctx) return;
    try {
      this._ctx     = new (window.AudioContext || window.webkitAudioContext)();
      this._master  = this._ctx.createGain();
      this._sfxGain = this._ctx.createGain();
      this._uiGain  = this._ctx.createGain();
      this._musicGain = this._ctx.createGain();

      this._master.gain.value  = this.volumes.master;
      this._sfxGain.gain.value = this.volumes.sfx;
      this._uiGain.gain.value  = this.volumes.ui;
      this._musicGain.gain.value = this.volumes.music;

      this._sfxGain.connect(this._master);
      this._uiGain.connect(this._master);
      this._musicGain.connect(this._master);
      this._master.connect(this._ctx.destination);

      this._startAmbientMusic();
    } catch (e) {
      console.warn('[Audio] Web Audio API not available:', e.message);
    }
  }

  setVolume(category, value) {
    this.volumes[category] = value;
    if (!this._ctx) return;
    if (category === 'master' && this._master)   this._master.gain.value  = value;
    if (category === 'sfx'    && this._sfxGain)  this._sfxGain.gain.value = value;
    if (category === 'ui'     && this._uiGain)   this._uiGain.gain.value  = value;
    if (category === 'music'  && this._musicGain) this._musicGain.gain.value = value;
  }

  // ── Public play API ───────────────────────────────────────
  play(soundId, opts = {}) {
    if (!this._ctx) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();

    const now = Date.now();
    const cd  = this._cooldowns[soundId] ?? 0;
    if (cd > 0 && this._lastPlayed[soundId] && now - this._lastPlayed[soundId] < cd) return;
    this._lastPlayed[soundId] = now;

    try {
      this._playSynth(soundId, opts);
    } catch (e) {
      // Audio errors should never crash the game
    }
  }

  // ── Synthesizer ───────────────────────────────────────────
  _playSynth(id, opts = {}) {
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const sfx = this._sfxGain;
    const ui  = this._uiGain;

    switch (id) {
      // ── Gameplay SFX ──────────────────────────────────────
      case 'bit_pickup': {
        const freq = 440 + Math.random() * 220;
        _tone(ctx, sfx, 'sine', freq, 0.12, t, 0.001, 0.08);
        _tone(ctx, sfx, 'sine', freq * 1.5, 0.06, t + 0.02, 0.001, 0.06);
        break;
      }
      case 'bit_pickup_large': {
        _tone(ctx, sfx, 'sine', 660, 0.2, t, 0.001, 0.1);
        _tone(ctx, sfx, 'sine', 880, 0.15, t + 0.03, 0.001, 0.12);
        _tone(ctx, sfx, 'triangle', 1100, 0.1, t + 0.06, 0.001, 0.1);
        break;
      }
      case 'attack_swing': {
        _noise(ctx, sfx, 0.15, t, 0.005, 0.07, 800, 200);
        break;
      }
      case 'hit': {
        _tone(ctx, sfx, 'sawtooth', 120, 0.3, t, 0.001, 0.12);
        _noise(ctx, sfx, 0.25, t, 0.001, 0.1, 300, 80);
        break;
      }
      case 'hit_received': {
        _tone(ctx, sfx, 'sawtooth', 80, 0.4, t, 0.001, 0.18);
        _noise(ctx, sfx, 0.35, t, 0.001, 0.15, 200, 50);
        // Screen rumble effect via gain pulse
        this._master.gain.setValueAtTime(this.volumes.master * 1.3, t);
        this._master.gain.exponentialRampToValueAtTime(this.volumes.master, t + 0.12);
        break;
      }
      case 'jump': {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(sfx);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(500, t + 0.12);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.15);
        break;
      }
      case 'land': {
        _noise(ctx, sfx, 0.3, t, 0.001, 0.08, 150, 40);
        break;
      }
      case 'dash': {
        _noise(ctx, sfx, 0.2, t, 0.001, 0.08, 600, 100);
        _tone(ctx, sfx, 'sine', 800, 0.15, t, 0.001, 0.1);
        break;
      }
      case 'bank_progress': {
        _tone(ctx, ui, 'sine', 330, 0.06, t, 0.001, 0.05);
        break;
      }
      case 'bank_complete': {
        // Satisfying chord sweep
        [440, 550, 660, 880].forEach((f, i) => {
          _tone(ctx, ui, 'sine', f, 0.2 - i * 0.03, t + i * 0.06, 0.01, 0.25);
        });
        break;
      }
      case 'bank_cancel': {
        _tone(ctx, ui, 'sawtooth', 220, 0.15, t, 0.001, 0.1);
        _tone(ctx, ui, 'sawtooth', 180, 0.1,  t + 0.05, 0.001, 0.1);
        break;
      }
      case 'death': {
        [200, 150, 100, 60].forEach((f, i) => {
          _tone(ctx, sfx, 'sawtooth', f, 0.3 - i * 0.06, t + i * 0.08, 0.001, 0.15);
        });
        _noise(ctx, sfx, 0.4, t, 0.001, 0.3, 100, 20);
        break;
      }
      case 'respawn': {
        [400, 600, 800].forEach((f, i) => {
          _tone(ctx, sfx, 'sine', f, 0.15, t + i * 0.05, 0.001, 0.1);
        });
        break;
      }
      case 'most_wanted': {
        // Dramatic klaxon
        [440, 440, 550, 440].forEach((f, i) => {
          _tone(ctx, ui, 'square', f, 0.25, t + i * 0.12, 0.01, 0.1);
        });
        break;
      }
      case 'upgrade': {
        [330, 440, 550, 660, 880].forEach((f, i) => {
          _tone(ctx, ui, 'sine', f, 0.18, t + i * 0.04, 0.001, 0.12);
        });
        break;
      }
      case 'meltdown': {
        // Alarm siren
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(ui);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.3);
        osc.frequency.linearRampToValueAtTime(300, t + 0.6);
        osc.frequency.linearRampToValueAtTime(600, t + 0.9);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        osc.start(t); osc.stop(t + 1.0);
        break;
      }
      case 'countdown': {
        _tone(ctx, ui, 'sine', opts.final ? 880 : 660, opts.final ? 0.35 : 0.22, t, 0.001, opts.final ? 0.5 : 0.15);
        break;
      }
      case 'victory': {
        [523, 659, 784, 1047].forEach((f, i) => {
          _tone(ctx, ui, 'sine', f, 0.3 - i * 0.04, t + i * 0.1, 0.01, 0.4);
        });
        break;
      }
      case 'king': {
        [440, 554, 659, 880, 659, 554, 440].forEach((f, i) => {
          _tone(ctx, ui, 'triangle', f, 0.2, t + i * 0.07, 0.005, 0.1);
        });
        break;
      }
      case 'greed_spin': {
        const freq = opts.freq || 400 + Math.random() * 200;
        _tone(ctx, ui, 'sine', freq, 0.1, t, 0.001, 0.06);
        break;
      }
      case 'jackpot': {
        // Celebration
        for (let i = 0; i < 8; i++) {
          const f = [523, 659, 784, 1047, 1319, 1047, 784, 659][i];
          _tone(ctx, ui, 'sine', f, 0.3, t + i * 0.07, 0.005, 0.1);
          _tone(ctx, ui, 'triangle', f * 2, 0.1, t + i * 0.07 + 0.02, 0.001, 0.08);
        }
        break;
      }
      case 'bust': {
        // Devastating descend
        [400, 300, 200, 120, 80].forEach((f, i) => {
          _tone(ctx, sfx, 'sawtooth', f, 0.25, t + i * 0.1, 0.001, 0.12);
        });
        _noise(ctx, sfx, 0.3, t + 0.2, 0.001, 0.4, 100, 20);
        break;
      }
    }
  }

  // ── Ambient music ─────────────────────────────────────────
  _startAmbientMusic() {
    if (this._musicStarted || !this._ctx) return;
    this._musicStarted = true;
    this._scheduleMusicLoop();
  }

  _scheduleMusicLoop() {
    if (!this._ctx) return;
    const ctx  = this._ctx;
    const gain = this._musicGain;
    const t    = ctx.currentTime;

    // Low rumbling bass drone
    const bass = ctx.createOscillator();
    const bg   = ctx.createGain();
    bass.connect(bg); bg.connect(gain);
    bass.type = 'sawtooth';
    bass.frequency.value = this._meltdownMusic ? 55 : 40;
    bg.gain.setValueAtTime(0.08, t);
    bass.start(t);

    // Pulse it
    const lfo = ctx.createOscillator();
    const lg  = ctx.createGain();
    lfo.connect(lg); lg.connect(bg.gain);
    lfo.type = 'sine';
    lfo.frequency.value = this._meltdownMusic ? 2 : 0.5;
    lg.gain.value = 0.04;
    lfo.start(t);

    // Store to stop on meltdown switch
    this._musicNodes = [bass, lfo];

    // Restart loop every 30s
    this._musicLoopTimeout = setTimeout(() => {
      try { bass.stop(); lfo.stop(); } catch {}
      this._scheduleMusicLoop();
    }, 30000);
  }

  startMeltdownMusic() {
    if (this._meltdownMusic) return;
    this._meltdownMusic = true;
    // Stop old loop
    clearTimeout(this._musicLoopTimeout);
    if (this._musicNodes) {
      try { this._musicNodes.forEach(n => n.stop()); } catch {}
    }
    this._scheduleMusicLoop();
    this.play('meltdown');
  }

  stopMeltdownMusic() {
    this._meltdownMusic = false;
    clearTimeout(this._musicLoopTimeout);
    if (this._musicNodes) {
      try { this._musicNodes.forEach(n => n.stop()); } catch {}
    }
    this._scheduleMusicLoop();
  }

  dispose() {
    clearTimeout(this._musicLoopTimeout);
    if (this._musicNodes) {
      try { this._musicNodes.forEach(n => n.stop()); } catch {}
    }
    if (this._ctx) this._ctx.close();
  }
}

// ── Synth helpers ─────────────────────────────────────────────

function _tone(ctx, dest, type, freq, amp, startT, attack, release) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(dest);
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startT);
  g.gain.linearRampToValueAtTime(amp, startT + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, startT + attack + release);
  osc.start(startT);
  osc.stop(startT + attack + release + 0.01);
}

function _noise(ctx, dest, amp, startT, attack, release, highFreq = 800, lowFreq = 100) {
  const bufferSize = ctx.sampleRate * (attack + release);
  const buf  = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src    = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g      = ctx.createGain();

  src.buffer  = buf;
  filter.type = 'bandpass';
  filter.frequency.value  = (highFreq + lowFreq) / 2;
  filter.Q.value          = 0.5;

  src.connect(filter); filter.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, startT);
  g.gain.linearRampToValueAtTime(amp, startT + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, startT + attack + release);
  src.start(startT);
  src.stop(startT + attack + release + 0.01);
}
