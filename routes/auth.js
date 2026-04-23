// ============================================================
// CV-Mister — Auth Routes
// Register, Login, Forgot Password, Reset Password
// ============================================================

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { 
  validate, 
  registerSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} = require('../middleware/validation');

const JWT_SECRET = process.env.JWT_SECRET || 'cv-mister-luxe-secret-2026';

// ── Helper: Generate Token ──────────────────────────────────
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

// ── Sync Firebase User to MongoDB ─────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const { firebaseUID, email, fullName } = req.body;

    if (!firebaseUID || !email) {
      return res.status(400).json({ error: 'firebaseUID and email are required' });
    }

    let user = await User.findOne({ firebaseUID });

    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.firebaseUID = firebaseUID;
        await user.save();
      } else {
        user = await User.create({
          fullName: fullName || 'New User',
          email,
          firebaseUID,
        });
      }
    }

    res.status(200).json({
      message: 'User synced successfully',
      user: {
        _id: user._id,
        firebaseUID: user.firebaseUID,
        fullName: user.fullName,
        email: user.email,
        plan: user.plan,
        isPremium: user.isPremium || false,
        paymentStatus: user.paymentStatus || 'none'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Register ────────────────────────────────────────────────
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: 'User already exists' });

    const user = await User.create({ fullName, email, password });
    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      plan: user.plan || 'free',
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login ───────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        plan: user.plan || 'free',
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Forgot Password ─────────────────────────────────────────
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await user.save();

    // Mock email for now (Log to console) or use Nodemailer
    console.log(`Password reset link: http://localhost:5173/reset-password/${resetToken}`);
    
    res.json({ message: 'Password reset link sent to your email (Mocked in console)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset Password ──────────────────────────────────────────
router.post('/reset-password/:token', validate(resetPasswordSchema), async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { protect } = require('../middleware/auth');

// ── Update Profile ──────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.fullName = req.body.fullName || user.fullName;
    user.email = req.body.email || user.email;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updated = await user.save();
    res.json({
      _id: updated._id,
      fullName: updated.fullName,
      email: updated.email,
      plan: updated.plan || 'free',
      token: generateToken(updated._id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get Current User ─────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
