// ============================================================
// CV-Mister — Socket.IO Manager (Real-time Events)
// Centralized socket instance for use across all routes
// ============================================================

let io = null;

/**
 * Initialize Socket.IO with the HTTP server
 * @param {import('http').Server} server - HTTP server instance
 * @returns {import('socket.io').Server} io instance
 */
function initSocket(server) {
  const { Server } = require('socket.io');
  
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://localhost:3001'],

      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] ✅ Client connected: ${socket.id}`);

    // Admin joins admin room for targeted events
    socket.on('join-admin', () => {
      socket.join('admin-room');
      console.log(`[Socket.IO] 👨‍💼 Admin joined: ${socket.id}`);
    });

    // User joins their own room (by userId) for personal notifications
    socket.on('join-user', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        console.log(`[Socket.IO] 👤 User ${userId} joined their room`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] ❌ Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[Socket.IO] 🔌 Real-time server initialized');
  return io;
}

/**
 * Get the current Socket.IO instance
 * @returns {import('socket.io').Server}
 */
function getIO() {
  if (!io) {
    console.warn('[Socket.IO] ⚠️ Socket.IO not initialized yet');
  }
  return io;
}

// ── Event Emitters ─────────────────────────────────────────

/**
 * Notify admins when a new payment/upgrade request is submitted
 */
function emitNewPayment(paymentData) {
  if (!io) return;
  io.to('admin-room').emit('new-payment', {
    type: 'new-payment',
    data: paymentData,
    timestamp: new Date().toISOString(),
  });
  console.log('[Socket.IO] 📢 Emitted new-payment to admin-room');
}

/**
 * Notify admins and the specific user when a payment status changes
 */
function emitStatusUpdate(paymentData, userId) {
  if (!io) return;
  
  // Notify all admins
  io.to('admin-room').emit('payment-status-changed', {
    type: 'payment-status-changed',
    data: paymentData,
    timestamp: new Date().toISOString(),
  });

  // Notify the specific user
  if (userId) {
    const room = `user-${userId}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const socketsInRoom = roomSockets ? roomSockets.size : 0;
    console.log(`[Socket.IO] 📢 Emitting plan update to room "${room}" — ${socketsInRoom} socket(s) in room`);
    
    io.to(room).emit('my-plan-updated', {
      type: 'my-plan-updated',
      data: paymentData,
      timestamp: new Date().toISOString(),
    });

    // Also emit to firebaseUID-based room (fallback for clients that joined before _id was available)
    if (paymentData.firebaseUID) {
      const fbRoom = `user-${paymentData.firebaseUID}`;
      io.to(fbRoom).emit('my-plan-updated', {
        type: 'my-plan-updated',
        data: paymentData,
        timestamp: new Date().toISOString(),
      });
      console.log(`[Socket.IO] 📢 Also emitted to firebaseUID room "${fbRoom}"`);
    }
  }



  console.log('[Socket.IO] 📢 Emitted payment-status-changed to admin-room');
}

/**
 * Notify a specific user that their plan was changed
 */
function emitPlanChange(userId, plan) {
  if (!io) return;
  io.to(`user-${userId}`).emit('my-plan-updated', {
    type: 'my-plan-updated',
    data: { plan },
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initSocket,
  getIO,
  emitNewPayment,
  emitStatusUpdate,
  emitPlanChange,
};
