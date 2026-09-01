// ============================================================
// GREED.exe - RoomManager
// Creates, tracks and destroys game rooms
// ============================================================

import { GameRoom } from './GameRoom.js';
import { GAME_CONFIG } from '../../shared/constants.js';

// roomId → GameRoom
const rooms = new Map();

export const RoomManager = {
  init() {
    console.log('[RoomManager] Initialized');
    // Pre-create one room so the first player joins instantly
    _createRoom();
  },

  findOrCreateRoom() {
    // Find a room that is in LOBBY or has space
    for (const room of rooms.values()) {
      if (room.canAcceptPlayer()) return room;
    }
    return _createRoom();
  },

  getRoom(roomId) {
    return rooms.get(roomId) || null;
  },

  getRoomCount() {
    return rooms.size;
  },

  getTotalPlayerCount() {
    let count = 0;
    for (const room of rooms.values()) count += room.getPlayerCount();
    return count;
  },

  // Called by a room when it becomes empty and is done
  destroyRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.destroy();
    rooms.delete(roomId);
    console.log(`[RoomManager] Room ${roomId} destroyed. Active rooms: ${rooms.size}`);

    // Always keep at least one empty room available
    if (rooms.size === 0) _createRoom();
  },

  shutdown() {
    for (const room of rooms.values()) room.destroy();
    rooms.clear();
  },
};

function _createRoom() {
  const room = new GameRoom(RoomManager);
  rooms.set(room.id, room);
  console.log(`[RoomManager] Room ${room.id} created. Active rooms: ${rooms.size}`);
  return room;
}
