const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { isAdmin } = require('../middleware/isAdmin');
const Content = require('../models/Content');
const Message = require('../models/Message');

const JWT_SECRET = process.env.JWT_SECRET || 'cv-mister-luxe-secret-2026';

// The requested strict password. We generate its hash on server start.
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('alhammadiahmed', 10);

// ── Rate Limiter: Max 5 attempts per minute ─────────────────
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, 
  message: { error: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول. يرجى المحاولة بعد دقيقة.', redirect: '/' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── UNIVERSAL ROUTE: Deactivate PRO (Supports both PUT & POST for compatibility) ────
const handleDeactivate = async (req, res) => {
  const userId = req.params.id;
  console.log(`[Admin] Manual Deactivation Request: ${req.method} ${userId}`);
  
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    user.plan = 'free';
    user.isPremium = false; // Set explicit premium flag to false
    user.paymentStatus = 'none'; // Resets payment status to none, forcing a new payment
    // Optional: Reset any pending upgrade limits if we are just manually revoking access
    user.upgradeFailedAttempts = 0; 
    user.upgradeLockedUntil = null;
    await user.save();

    // ── Emit Real-time Event to force immediate downgrade on user's device ──
    const { emitStatusUpdate } = require('../socketManager');
    emitStatusUpdate({
      requestId: user._id.toString(), // Using userId as dummy requestId
      action: 'deactivate',
      status: 'none',
      plan: 'free',
      isPremium: false,
      userName: user.fullName || 'User',
      userEmail: user.email,
      userId: user._id.toString(),
      rejectionReason: 'تم إنهاء اشتراكك من قبل الإدارة',
    }, user._id.toString());

    res.json({
      success: true,
      message: 'تم إلغاء تفعيل باقة Pro للمستخدم بنجاح ❌',
      data: { plan: user.plan }
    });
  } catch (err) {
    console.error('[Admin] Deactivation Error:', err);
    res.status(500).json({ error: 'فشل الإلغاء في الباك إند' });
  }
};

router.put('/deactivate-pro/:id', isAdmin, handleDeactivate);
router.post('/deactivate-pro/:id', isAdmin, handleDeactivate);

// ── Public Endpoint: Admin Login ────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || username !== 'ahmedyes') {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!isMatch) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign(
      { id: 'cv-mister-admin', username: 'ahmedyes', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token
    });
  } catch (error) {
    console.error('[Admin Login Error]', error);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// GET Site Settings (CMS Content) - PUBLIC
router.get('/content', async (req, res) => {
  console.log('[CMS] Public GET /content requested');
  try {
    let content = await Content.findOne({ key: 'site_settings' });
    if (!content) {
      return res.json({ success: true, settings: null });
    }
    res.json({ success: true, settings: content.settings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// ============================================================
// 🔒 PROTECTED ADMIN ROUTES (Middleware Applied)
// ============================================================
router.use(isAdmin);

// UPDATE Site Settings (CMS Content) - PROTECTED
router.post('/content', async (req, res) => {
  try {
    const { settings } = req.body;
    let content = await Content.findOneAndUpdate(
      { key: 'site_settings' },
      { settings },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Settings updated successfully', settings: content.settings });
  } catch (error) {
    console.error('[CMS Update Error]', error);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// Dashboard statistics — REAL DATA
router.get('/dashboard', async (req, res) => {
  try {
    const User = require('../models/User');
    const UpgradeRequest = require('../models/UpgradeRequest');

    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({ plan: 'pro' });
    const pendingRequests = await UpgradeRequest.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      data: {
        stats: { totalUsers, premiumUsers, pendingRequests, totalTemplates: 23 },
        message: 'Welcome to the Secure Admin Dashboard, ahmedyes!'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Free upgrade by email
router.post('/free-upgrade', isAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });

    const User = require('../models/User');
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.plan === 'pro') return res.status(400).json({ error: 'المستخدم لديه خطة Pro بالفعل' });

    user.plan = 'pro';
    user.isPremium = true;
    user.paymentStatus = 'approved';

    // Set subscription duration (30 days) and resume limit (2)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    user.resumesLimit = 2; 
    user.subscriptionEndDate = endDate;
    await user.save();

    // Emit real-time event to unlock templates immediately
    const { emitStatusUpdate } = require('../socketManager');
    emitStatusUpdate({
      requestId: user._id.toString(),
      action: 'activate',
      status: 'approved',
      plan: 'pro',
      isPremium: true,
      userName: user.fullName,
      userEmail: user.email,
      userId: user._id.toString(),
    }, user._id.toString());

    res.json({ success: true, message: `تم تفعيل خطة Pro مجاناً للمتسخدم ${user.fullName}` });
  } catch (err) {
    console.error('[Free Upgrade Error]', err);
    res.status(500).json({ error: 'فشل تفعيل المستخدم' });
  }
});

// Users Management — REAL DATA
router.get('/users', isAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find()
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update User Plan Manual Toggle
router.put('/update-user-plan', isAdmin, async (req, res) => {
  try {
    const { userId, plan } = req.body;
    if (!userId || !['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'بيانات غير صالحة' });
    }

    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    user.plan = plan;
    await user.save();

    res.json({ success: true, message: `تم تحويل المستخدم إلى ${plan === 'pro' ? 'Pro ✅' : 'Free ❌'} بنجاح` });
  } catch (err) {
    console.error('[Update User Plan Error]', err);
    res.status(500).json({ error: 'عطل في الخادم' });
  }
});

// Unblock a user manually
// Unblock a user manually (Supports PUT and POST)
const performUnblock = async (req, res) => {
  console.log(`[Admin] Manual Unblock triggered for ID: ${req.params.id}`);
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.id);
    if (!user) {
      const UpgradeRequest = require('../models/UpgradeRequest');
      const reqDoc = await UpgradeRequest.findById(req.params.id);
      if (reqDoc) {
        const actualUser = await User.findById(reqDoc.user);
        if (actualUser) {
          actualUser.upgradeFailedAttempts = 0;
          actualUser.upgradeLastRejectedAt = null;
          actualUser.upgradeLockedUntil = null;
          actualUser.failedAttempts = 0;
          actualUser.rejectedAt = null;
          actualUser.cooldownUntil = null;
          await actualUser.save();
          return res.json({ success: true, message: 'تم فك الحظر عن المستخدم وجميع قيوده' });
        }
      }
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    user.upgradeFailedAttempts = 0;
    user.upgradeLastRejectedAt = null;
    user.upgradeLockedUntil = null;
    user.failedAttempts = 0;
    user.rejectedAt = null;
    user.cooldownUntil = null;
    await user.save();

    res.json({ success: true, message: 'تم فك الحظر عن المستخدم بنجاح' });
  } catch (err) {
    console.error('[Unblock User Error]', err);
    res.status(500).json({ error: 'فشل فك الحظر' });
  }
};

router.put('/unblock-user/:id', isAdmin, performUnblock);
router.post('/unblock-user/:id', isAdmin, performUnblock);

// ── Admin: Unified Update Status (Activate/Deactivate/Unblock) ──────
router.post('/update-status/:id', isAdmin, async (req, res) => {
  const mongoose = require('mongoose');
  try {
    const UpgradeRequest = require('../models/UpgradeRequest');
    const User = require('../models/User');
    const { action, rejectionReason } = req.body; 

    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'معرّف غير صالح' });
    }
    
    // Check if ID is an UpgradeRequest or direct User ID
    let request = await UpgradeRequest.findById(targetId);
    let user;

    if (request) {
      user = await User.findById(request.user);
    } else {
      user = await User.findById(targetId);
    }

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (action === 'activate') {
      // 1. Determine plan (Explicit from body OR detection from amount)
      let targetPlan = req.body.plan; // Explicitly passed by admin in some cases
      let targetLimit;

      if (targetPlan) {
        targetLimit = targetPlan === 'business' ? 9999 : 2;
      } else {
        // Fallback to detection based on amount (79 for Business, 29 for Pro)
        const amount = request?.amount || 29;
        const isBusiness = amount > 50;
        targetPlan = isBusiness ? 'business' : 'pro';
        targetLimit = isBusiness ? 9999 : 2;
      }

      user.plan = targetPlan;
      user.isPremium = true; // Set explicit premium flag to true
      user.paymentStatus = 'approved';
      user.upgradeFailedAttempts = 0;
      user.upgradeLastRejectedAt = null;
      user.upgradeLockedUntil = null;

      // Set subscription duration (30 days) and resume limit
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      user.subscriptionEndDate = user.subscriptionEndDate || endDate; 
      user.resumesLimit = user.resumesLimit || targetLimit; 
      
      // Mark all pending requests for this user as approved
      await UpgradeRequest.updateMany(
        { user: user._id, status: 'pending' },
        { 
          status: 'approved', 
          reviewedAt: new Date(), 
          processedBy: 'Admin (Ahmed)' 
        }
      );
    } else if (action === 'deactivate') {
      user.plan = 'free';
      user.isPremium = false; // Set explicit premium flag to false
      user.paymentStatus = 'rejected';
      
      // Increment failed attempts and track last rejection
      user.upgradeFailedAttempts = (user.upgradeFailedAttempts || 0) + 1;
      user.upgradeLastRejectedAt = new Date();
      
      // Lock for 24 hours if 10 failed attempts reached
      if (user.upgradeFailedAttempts >= 10) {
        user.upgradeLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      
      // 1. Mark all pending requests for this user as rejected
      await UpgradeRequest.updateMany(
        { user: user._id, status: 'pending' },
        { 
          status: 'rejected', 
          rejectionReason: rejectionReason || 'تم رفض الترقية من قبل الإدارة',
          reviewedAt: new Date(), 
          processedBy: 'Admin (Ahmed)' 
        }
      );

      // 2. ALSO mark any previously approved requests for this user as rejected
      // (This fixes the bug where a deactivated user still had an "Approved" row in PaymentTable)
      await UpgradeRequest.updateMany(
        { user: user._id, status: 'approved' },
        { 
          status: 'rejected', 
          rejectionReason: 'تم إلغاء التفعيل من قبل الإدارة',
          reviewedAt: new Date(), 
          processedBy: 'Admin (Ahmed)' 
        }
      );
    } else if (action === 'review' || action === 'unblock') {
      if (request) {
        request.status = 'pending';
        request.rejectionReason = undefined;
      }
      user.upgradeFailedAttempts = 0;
      user.upgradeLastRejectedAt = null;
      user.upgradeLockedUntil = null;
      user.paymentStatus = 'pending';
    }

    // If target was a specific request, ensure it is updated even if it wasn't pending
    if (request) {
      if (action === 'activate') request.status = 'approved';
      if (action === 'deactivate') {
        request.status = 'rejected';
        request.rejectionReason = rejectionReason || 'تم رفض النقل من قبل الإدارة';
      }
      if (action === 'review' || action === 'unblock') {
         request.status = 'pending';
         request.rejectionReason = undefined;
      }
      request.reviewedAt = new Date();
      request.processedBy = 'Admin (Ahmed)';
      await request.save();
    }
    
    await user.save();

    const responseData = {
      success: true,
      status: request ? request.status : (action === 'activate' ? 'approved' : action === 'deactivate' ? 'rejected' : 'pending'),
      plan: user.plan,
      message: action === 'activate' ? 'تم التفعيل بنجاح ✅' : 
               action === 'deactivate' ? 'تم إلغاء التفعيل ❌' : 'تم فك الحظر بنجاح 🔓'
    };

    // ── Emit Real-time Event ──────────────────────────────
    const { emitStatusUpdate } = require('../socketManager');
    emitStatusUpdate({
      requestId: targetId,
      action,
      status: responseData.status,
      plan: user.plan,
      isPremium: user.isPremium,
      userName: user.fullName || 'User',
      userEmail: user.email,
      userId: user._id.toString(),
      rejectionReason: rejectionReason || null,
    }, user._id.toString());

    res.json(responseData);
  } catch (err) {
    console.error('[Admin Status Update Error]', err);
    res.status(500).json({ 
      error: 'حدث خطأ في تحديث الحالة في الخادم',
      details: err.message 
    });
  }
});

// ── Admin: Delete User ──────────────────────────────────────
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف المستخدم' });
  }
});

// ── Admin: Toggle User Status (Block/Active) ─────────────────
router.put('/users/status/:id', isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة' });
    }
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ success: true, message: 'تم تحديث حالة المستخدم بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

// ── Admin: Contact Messages ──────────────────────────────────
router.get('/messages', async (req, res) => {
  console.log('[Admin] Fetching contact messages...');
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).lean();
    console.log(`[Admin] Found ${messages.length} messages.`);
    res.json({ success: true, data: messages });
  } catch (err) {
    console.error('[Admin] Messages Fetch Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/messages/:id/read', async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.id, { status: 'read' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف الرسالة بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف الرسالة' });
  }
});

// ── Admin: Site Settings (isFreeAllowed toggle) ───────────────
router.get('/settings', isAdmin, async (req, res) => {
  try {
    const Content = require('../models/Content');
    const content = await Content.findOne({ key: 'site_settings' });
    res.json({ success: true, settings: content ? content.settings : { isFreeAllowed: true } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/settings', isAdmin, async (req, res) => {
  try {
    const { isFreeAllowed } = req.body;
    const Content = require('../models/Content');
    
    let content = await Content.findOne({ key: 'site_settings' });
    if (!content) {
      content = new Content({ key: 'site_settings', settings: { isFreeAllowed } });
    } else {
      content.settings = { ...content.settings, ...req.body };
      content.markModified('settings');
    }
    
    await content.save();
    
    // Broadcast update to all users
    const { getIO } = require('../socketManager');
    const io = getIO();
    if (io) io.emit('settingsUpdate', { type: 'global', settings: content.settings });

    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح', settings: content.settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Admin: Template Management ──────────────────────────────
router.get('/templates/settings', async (req, res) => {
  try {
    const Content = require('../models/Content');
    const content = await Content.findOne({ key: 'site_settings' });
    res.json({ success: true, templates: content?.settings?.templates || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template settings' });
  }
});

router.post('/templates/update', async (req, res) => {
  try {
    const { templateId, enabled, isPremium } = req.body;
    const Content = require('../models/Content');
    
    let content = await Content.findOne({ key: 'site_settings' });
    if (!content) {
      content = new Content({ key: 'site_settings', settings: { templates: {} } });
    }
    
    if (!content.settings.templates) content.settings.templates = {};
    
    content.settings.templates[templateId] = {
      enabled: enabled !== undefined ? enabled : (content.settings.templates[templateId]?.enabled ?? true),
      isPremium: isPremium !== undefined ? isPremium : (content.settings.templates[templateId]?.isPremium ?? true)
    };
    
    content.markModified('settings');
    await content.save();
    
    res.json({ success: true, message: 'تم تحديث القالب بنجاح', templates: content.settings.templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.post('/templates/update-bulk', async (req, res) => {
  try {
    const { updates } = req.body; // { 'simple': { enabled: true, isPremium: false }, ... }
    const Content = require('../models/Content');
    
    let content = await Content.findOne({ key: 'site_settings' });
    if (!content) {
      content = new Content({ key: 'site_settings', settings: { templates: updates } });
    } else {
      content.settings.templates = { ...(content.settings.templates || {}), ...updates };
      content.markModified('settings');
    }
    
    await content.save();
    res.json({ success: true, message: 'تم تحديث القوالب بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update templates' });
  }
});
// Update User Subscription (End Date and Resume Limit)
router.put('/users/:id/subscription', isAdmin, async (req, res) => {
  try {
    const { subscriptionEndDate, resumesLimit } = req.body;
    const User = require('../models/User');
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (subscriptionEndDate !== undefined) user.subscriptionEndDate = subscriptionEndDate;
    if (resumesLimit !== undefined) user.resumesLimit = resumesLimit;
    
    await user.save();

    // Emit real-time update to the user
    const { getIO } = require('../socketManager');
    const io = getIO();
    if (io) io.to(user._id.toString()).emit('my-plan-updated', { 
      data: { 
        plan: user.plan, 
        isPremium: user.isPremium,
        subscriptionEndDate: user.subscriptionEndDate,
        resumesLimit: user.resumesLimit
      } 
    });

    res.json({ success: true, message: 'تم تحديث بيانات الاشتراك بنجاح', data: user });
  } catch (err) {
    console.error('[Update Subscription Error]', err);
    res.status(500).json({ error: 'عطل في الخادم' });
  }
});

module.exports = router;
