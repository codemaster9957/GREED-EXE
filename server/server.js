// ============================================================
// GREED.exe - Main Server Entry Point
// Render Web Service compatible
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { ConnectionManager } from './networking/ConnectionManager.js';
import { RoomManager } from './rooms/RoomManager.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// ── HTTP Server ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint (required by Render)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    rooms: RoomManager.getRoomCount(),
    players: RoomManager.getTotalPlayerCount(),
    timestamp: Date.now(),
  });
});

app.get('/', (_req, res) => {
  res.json({ game: 'GREED.exe', status: 'running' });
});

const httpServer = createServer(app);

// ── WebSocket Server ─────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// Boot the room manager (creates the default room pool)
RoomManager.init();

// Hand off every new socket to the connection manager
wss.on('connection', (socket, request) => {
  ConnectionManager.handleConnection(socket, request);
});

wss.on('error', (err) => {
  console.error('[WSS] Server error:', err);
});

// ── Ping / keepalive loop (every 30s) ────────────────────────
// Detects dead connections that Render's load balancer may have
// silently dropped.
const PING_INTERVAL = 30_000;
setInterval(() => {
  wss.clients.forEach((socket) => {
    if (socket.isAlive === false) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, PING_INTERVAL);

// ── HTTP listen ───────────────────────────────────────────────
httpServer.listen(PORT, HOST, () => {
  console.log(`[GREED.exe] Server listening on ${HOST}:${PORT}`);
});

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown(signal) {
  console.log(`[GREED.exe] Received ${signal} — shutting down gracefully`);
  RoomManager.shutdown();
  httpServer.close(() => {
    console.log('[GREED.exe] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 5 s if something hangs
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
