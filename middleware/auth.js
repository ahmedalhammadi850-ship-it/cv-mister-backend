// ============================================================
// CV-Mister — Auth Middleware
// Hybrid: Supports both Firebase ID Tokens and local JWTs
// ============================================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'cv-mister-luxe-secret-2026';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];

    // ── Try 1: Local JWT ──────────────────────────────────────
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      if (req.user) return next();
    } catch (_) {
      // Not a local JWT — try Firebase token next
    }

    // ── Try 2: Firebase ID Token ──────────────────────────────
    try {
      // Decode the Firebase token payload (base64) to extract the user ID (sub)
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const firebaseUID = payload.sub; // Firebase UID is in the "sub" claim

        if (firebaseUID) {
          const user = await User.findOne({ firebaseUID }).select('-password');
          if (user) req.user = user;
        }
      }
    } catch (_) {}

    // ── Global Subscription Expiry Check ──────────────────────
    if (req.user && req.user.plan !== 'free' && req.user.subscriptionEndDate) {
      if (new Date() > new Date(req.user.subscriptionEndDate)) {
        console.log(`[Auth] 🔒 Subscription expired for ${req.user.email}. Downgrading to Free.`);
        req.user.plan = 'free';
        req.user.isPremium = false;
        await req.user.save();
      }
    }

    if (req.user) return next();

    // Both methods failed
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token' });
  }
};

module.exports = { protect };
