// ============================================================
// CV-Mister — MongoDB Change Streams (Real-time DB Monitor)
// Watches User collection and notifies frontend via Socket.IO
// ============================================================

const User = require('./models/User');
const { getIO } = require('./socketManager');

/**
 * Initializes MongoDB Change Stream for the User collection
 * NOTE: Requires MongoDB Replica Set to work.
 */
function initChangeStreams() {
  const io = getIO();
  if (!io) {
    console.error('[ChangeStream] ❌ Socket.IO not initialized. Cannot start watcher.');
    return;
  }

  console.log('[ChangeStream] 🔍 Starting watcher for User collection...');

  // Watch for updates on the User collection
  const userWatcher = User.watch([], { fullDocument: 'updateLookup' });

  userWatcher.on('change', (change) => {
    try {
      // We only care about 'update' operations
      if (change.operationType === 'update') {
        const updatedFields = change.updateDescription.updatedFields;
        const userId = change.documentKey._id.toString();

        // Check if plan or isPremium was changed
        if (updatedFields.plan || updatedFields.isPremium !== undefined || updatedFields.resumesLimit !== undefined) {
          console.log(`[ChangeStream] ✨ Detected plan/limit update for user: ${userId}`);

          const fullUser = change.fullDocument;

          // Emit to the specific user's room
          io.to(`user-${userId}`).emit('my-plan-updated', {
            type: 'realtime-db-sync',
            data: {
              plan: fullUser.plan,
              isPremium: fullUser.isPremium,
              resumesLimit: fullUser.resumesLimit,
              subscriptionEndDate: fullUser.subscriptionEndDate,
              paymentStatus: fullUser.paymentStatus
            },
            timestamp: new Date().toISOString(),
          });

          console.log(`[ChangeStream] 📢 Socket notification sent to user-${userId}`);
        }
      }
    } catch (err) {
      console.error('[ChangeStream] ❌ Error processing change event:', err);
    }
  });

  userWatcher.on('error', (err) => {
    console.error('[ChangeStream] ❌ Watcher error:', err.message);
    // Standalone MongoDB instances do not support Change Streams.
    if (err.message.includes('not a replica set')) {
      console.warn('[ChangeStream] ⚠️ Change Streams require a Replica Set. Watcher disabled.');
    }
  });
}

module.exports = { initChangeStreams };
