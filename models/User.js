// ============================================================
// CV-Mister — User Model
// Schema for authentication and account management
// ============================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  firebaseUID: { type: String, unique: true, sparse: true }, 
  password: { type: String, required: false }, 
  plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
  isPremium: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  // ── Subscription Management ──────────────────────────────
  subscriptionEndDate: { type: Date, default: null },
  resumesLimit: { type: Number, default: 1 },                // Default limit for new users or free tier (Free: 1)

  // ── Rate Limiting for Upgrade Requests ─────────────────────
  upgradeFailedAttempts: { type: Number, default: 0 },       // consecutive rejected attempts
  upgradeLastRejectedAt: { type: Date, default: null },      // timestamp of last rejection
  upgradeLockedUntil: { type: Date, default: null },         // hard lockout expiry (24h after 3 fails)
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

