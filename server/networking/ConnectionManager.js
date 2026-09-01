// ============================================================
// GREED.exe - ConnectionManager
// Handles raw WebSocket lifecycle; routes messages to rooms
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { parseMessage, createMessage } from '../../shared/messages.js';
import { MSG, PROTOCOL_VERSION } from '../../shared/messages.js';
import { RoomManager } from '../rooms/RoomManager.js';

// playerId → { socket, roomId, playerData }
const connections = new Map();

export const ConnectionManager = {
  // ── New connection ────────────────────────────────────────
  handleConnection(socket, request) {
    const connectionId = uuidv4();
    socket.isAlive = true; // for ping/pong keepalive

    // Determine remote IP for basic logging
    const ip =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.socket.remoteAddress ||
      'unknown';

    console.log(`[Conn] New connection: ${connectionId} from ${ip}`);

    // Mark alive on pong
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      try {
        const msg = parseMessage(raw.toString());
        if (!msg) return;
        handleMessage(connectionId, socket, msg);
      } catch (err) {
        console.error(`[Conn] Message error from ${connectionId}:`, err);
      }
    });

    socket.on('close', (code, reason) => {
      console.log(`[Conn] Disconnected: ${connectionId} (${code})`);
      handleDisconnect(connectionId);
    });

    socket.on('error', (err) => {
      console.error(`[Conn] Socket error ${connectionId}:`, err.message);
    });

    // Store pending connection (not yet joined a room)
    connections.set(connectionId, { socket, roomId: null, playerId: null });
  },

  // ── Send to a specific connection ────────────────────────
  sendTo(connectionId, type, data) {
    const conn = connections.get(connectionId);
    if (!conn) return;
    _send(conn.socket, type, data);
  },

  // ── Broadcast to all connections in a room ────────────────
  broadcastToRoom(roomId, type, data, excludeConnectionId = null) {
    for (const [connId, conn] of connections) {
      if (conn.roomId === roomId && connId !== excludeConnectionId) {
        _send(conn.socket, type, data);
      }
    }
  },

  // ── Send to a specific player (by playerId) ───────────────
  sendToPlayer(playerId, type, data) {
    for (const [, conn] of connections) {
      if (conn.playerId === playerId) {
        _send(conn.socket, type, data);
        return;
      }
    }
  },

  getConnectionCount() {
    return connections.size;
  },

  getConnectionsInRoom(roomId) {
    const result = [];
    for (const [connId, conn] of connections) {
      if (conn.roomId === roomId) result.push(connId);
    }
    return result;
  },
};

// ── Internal helpers ─────────────────────────────────────────

function _send(socket, type, data) {
  if (socket.readyState !== 1 /* OPEN */) return;
  try {
    socket.send(JSON.stringify(createMessage(type, data)));
  } catch (err) {
    console.error('[Conn] Send error:', err.message);
  }
}

function handleMessage(connectionId, socket, msg) {
  const conn = connections.get(connectionId);
  if (!conn) return;

  // Version mismatch — warn but continue; let room handle it
  if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
    console.warn(
      `[Conn] Protocol version mismatch from ${connectionId}: got ${msg.v}`
    );
  }

  // ── Ping ────────────────────────────────────────────────
  if (msg.type === MSG.PING) {
    _send(socket, MSG.PONG, { t: msg.t });
    return;
  }

  // ── Join ─────────────────────────────────────────────────
  if (msg.type === MSG.JOIN) {
    if (conn.roomId) {
      // Already in a room — ignore duplicate joins
      return;
    }
    handleJoin(connectionId, socket, conn, msg);
    return;
  }

  // ── All other messages require room membership ───────────
  if (!conn.roomId) {
    _send(socket, MSG.ERROR, { message: 'Not in a room' });
    return;
  }

  // Delegate to the room
  const room = RoomManager.getRoom(conn.roomId);
  if (!room) {
    _send(socket, MSG.ERROR, { message: 'Room not found' });
    return;
  }

  room.handleMessage(conn.playerId, msg);
}

function handleJoin(connectionId, socket, conn, msg) {
  // Validate player name
  const rawName = (msg.name || '').trim();
  const playerName = rawName.slice(0, 20) || `Player_${connectionId.slice(0, 4)}`;
  const guestId   = (msg.guestId || '').trim() || uuidv4();

  // Find or create a room
  const room = RoomManager.findOrCreateRoom();
  if (!room) {
    _send(socket, MSG.ERROR, { message: 'No available rooms' });
    return;
  }

  // Add the player to the room
  const player = room.addPlayer(guestId, playerName, connectionId);
  if (!player) {
    _send(socket, MSG.ERROR, { message: 'Could not join room' });
    return;
  }

  // Update connection record
  conn.roomId   = room.id;
  conn.playerId = guestId;

  console.log(`[Conn] ${playerName} (${guestId}) joined room ${room.id}`);

  // Send join acknowledgement with room state
  _send(socket, MSG.JOIN_ACK, {
    playerId: guestId,
    roomId:   room.id,
    roomState: room.getStateSnapshot(),
    serverTime: Date.now(),
  });

  // Tell everyone else a new player arrived
  ConnectionManager.broadcastToRoom(room.id, MSG.PLAYER_JOINED, {
    player: player.getPublicState(),
  }, connectionId);
}

function handleDisconnect(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) return;

  if (conn.roomId && conn.playerId) {
    const room = RoomManager.getRoom(conn.roomId);
    if (room) {
      room.removePlayer(conn.playerId);
      ConnectionManager.broadcastToRoom(conn.roomId, MSG.PLAYER_LEFT, {
        playerId: conn.playerId,
      });
    }
  }

  connections.delete(connectionId);
}
