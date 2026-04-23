// ============================================================
// CV-Mister — UpgradeRequest Model
// Stores hawala payment proof submissions for manual approval
// ============================================================

const mongoose = require('mongoose');

const upgradeRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  // Base64 encoded image of the hawala/transfer receipt
  proofImage: { type: String, required: true },
  amount: { type: Number, default: 25 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },  // user-visible rejection reason
  processedBy: { type: String, default: '' },       // 'AI (n8n)' or 'Admin (Ahmed)'
  reviewedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('UpgradeRequest', upgradeRequestSchema);
