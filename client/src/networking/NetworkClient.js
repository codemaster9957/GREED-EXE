// ============================================================
// GREED.exe - NetworkClient
// WebSocket connection to the GREED server with:
//   • auto-reconnect with exponential backoff
//   • "waking server" UX for Render cold starts
//   • ping/pong latency tracking
//   • typed event emitter
// ============================================================

import { MSG, parseMessage, createMessage, PROTOCOL_VERSION } from '../../../shared/messages.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:3000';

const RECONNECT_DELAYS    = [1000, 2000, 4000, 8000, 15000, 30000];
const WAKE_HINT_AFTER_MS  = 5000;   // show "waking server" if still connecting
const PING_INTERVAL_MS    = 5000;

export class NetworkClient {
  constructor() {
    this._ws              = null;
    this._handlers        = new Map(); // type → [fn]
    this._reconnectAttempt = 0;
    this._reconnectTimer  = null;
    this._pingTimer       = null;
    this._wakeTimer       = null;
    this._pingStart       = 0;
    this.latency          = 0;
    this.connected        = false;
    this._destroyed       = false;
    this._onStatusChange  = null; // (status: string) => void   – UI hook
  }

  // ── Public API ────────────────────────────────────────────

  /** Connect and start auto-reconnect loop. */
  connect() {
    if (this._destroyed) return;
    this._openSocket();
  }

  /** Send a typed message to the server. */
  send(type, data = {}) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    try {
      this._ws.send(JSON.stringify(createMessage(type, data)));
    } catch (e) {
      console.warn('[Net] Send failed:', e.message);
    }
  }

  /** Register a handler for a message type. */
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(fn);
  }

  /** Remove a handler. */
  off(type, fn) {
    const list = this._handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  /** Hook called with human-readable status strings for the connect screen. */
  onStatusChange(fn) { this._onStatusChange = fn; }

  destroy() {
    this._destroyed = true;
    this._clearTimers();
    if (this._ws) { this._ws.onclose = null; this._ws.close(); }
  }

  // ── Internal ──────────────────────────────────────────────

  _openSocket() {
    this._setStatus('CONNECTING TO SERVER...');

    // Show "waking" hint after a delay (Render cold starts)
    this._wakeTimer = setTimeout(() => {
      this._setStatus('WAKING SERVER...\nRENDER FREE TIER MAY TAKE ~30s ON FIRST LOAD');
    }, WAKE_HINT_AFTER_MS);

    const ws = new WebSocket(SERVER_URL);
    this._ws = ws;

    ws.onopen = () => {
      this._clearTimers();
      this._reconnectAttempt = 0;
      this.connected = true;
      console.log('[Net] Connected to', SERVER_URL);
      this._setStatus('CONNECTED');
      this._startPing();
      this._emit('__connected__', {});
    };

    ws.onmessage = (event) => {
      const msg = parseMessage(event.data);
      if (!msg) return;

      // Pong: measure latency
      if (msg.type === MSG.PONG) {
        this.latency = Date.now() - this._pingStart;
        return;
      }

      this._emit(msg.type, msg);
    };

    ws.onclose = (ev) => {
      this.connected = false;
      this._stopPing();
      if (this._destroyed) return;

      console.log(`[Net] Disconnected (${ev.code}) — scheduling reconnect`);
      this._scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror always precedes onclose; let onclose drive reconnect
    };
  }

  _scheduleReconnect() {
    const delay = RECONNECT_DELAYS[
      Math.min(this._reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ];
    this._reconnectAttempt++;

    const seconds = Math.round(delay / 1000);
    this._setStatus(`CONNECTION LOST\nRETRYING IN ${seconds}s... (attempt ${this._reconnectAttempt})`);

    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) this._openSocket();
    }, delay);
  }

  _startPing() {
    this._pingTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._pingStart = Date.now();
        this.send(MSG.PING, { t: this._pingStart });
      }
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  _clearTimers() {
    clearTimeout(this._reconnectTimer);
    clearTimeout(this._wakeTimer);
    this._stopPing();
    this._reconnectTimer = null;
    this._wakeTimer      = null;
  }

  _emit(type, msg) {
    const handlers = this._handlers.get(type);
    if (!handlers) return;
    for (const fn of handlers) {
      try { fn(msg); } catch (e) { console.error('[Net] Handler error:', e); }
    }
  }

  _setStatus(text) {
    if (this._onStatusChange) this._onStatusChange(text);
  }
}
