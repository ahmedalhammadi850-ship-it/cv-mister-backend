// ============================================================
// CV-Mister — Upgrade Routes
// Handles payment proof submission & admin approval flow
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/isAdmin');
const UpgradeRequest = require('../models/UpgradeRequest');
const User = require('../models/User');

// ── Constants ───────────────────────────────────────────────
const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 3;

// ── Helper: Check if user is rate-limited ───────────────────
function getRateLimitStatus(user) {
  if (user.email.includes('ahmedyes') || user.fullName.includes('ahmedyes')) {
    return { blocked: false };
  }
  const now = new Date();

  // 1. Check for HARD 24h Lockout (set by Admin or system)
  if (user.upgradeLockedUntil && user.upgradeLockedUntil > now) {
    const remainMs = user.upgradeLockedUntil - now;
    const remainHrs = Math.ceil(remainMs / (60 * 60 * 1000));
    return {
      blocked: true,
      isLockout: true,
      remainMs,
      message: `تم حظر طلبات الترقية لحسابك مؤقتاً لمدة 24 ساعة بسبب كثرة المحاولات المرفوضة. يرجى المحاولة بعد ${remainHrs} ساعة.`,
    };
  }

  // 2. Check for standard 10min Cooldown after 3 consecutive fails
  const fails = user.upgradeFailedAttempts || 0;
  if (fails >= MAX_FAILED_ATTEMPTS && user.upgradeLastRejectedAt) {
    const cooldownEnd = new Date(user.upgradeLastRejectedAt.getTime() + COOLDOWN_MS);
    if (cooldownEnd > now) {
      const remainMs = cooldownEnd - now;
      const remainMins = Math.ceil(remainMs / (60 * 1000));
      return {
        blocked: true,
        isLockout: false,
        remainMs,
        message: `تم رفض طلبك ${fails} مرات متتالية. يرجى الانتظار ${remainMins} دقيقة للمراجعة اليدوية قبل المحاولة مجدداً.`,
      };
    }
  }
  return { blocked: false };
}

// ── User: Submit Upgrade Request (Upload hawala image) ──────
router.post('/request', protect, async (req, res) => {
  try {
    const { proofImage, amount } = req.body;
    if (!proofImage) return res.status(400).json({ error: 'صورة الحوالة مطلوبة' });
    if (req.user.plan === 'pro') return res.status(400).json({ error: 'حسابك مُفعّل بالفعل على خطة Pro!' });

    const rateLimitStatus = getRateLimitStatus(req.user);
    if (rateLimitStatus.blocked) {
      return res.status(429).json({ error: rateLimitStatus.message, remainMs: rateLimitStatus.remainMs });
    }

    // If a pending request exists, update it (allows retry after timeout)
    const existing = await UpgradeRequest.findOne({ user: req.user._id, status: 'pending' });
    if (existing) {
      existing.proofImage = proofImage;
      existing.amount = amount || 25;
      await existing.save();

      // ── Emit Real-time: Updated payment ──────────────
      const { emitNewPayment } = require('../socketManager');
      emitNewPayment({
        _id: existing._id,
        userName: req.user.fullName,
        userEmail: req.user.email,
        amount: amount || 25,
        status: 'pending',
        isUpdate: true,
        createdAt: existing.createdAt,
      });

      return res.status(200).json({ 
        success: true, 
        message: 'تم تحديث طلب الترقية. جاري التحقق الذكي...',
        requestId: existing._id 
      });
    }

    const request = await UpgradeRequest.create({
      user: req.user._id,
      userName: req.user.fullName,
      userEmail: req.user.email,
      proofImage,
      amount: amount || 25,
    });

    // ── Emit Real-time: New payment ──────────────────
    const { emitNewPayment } = require('../socketManager');
    emitNewPayment({
      _id: request._id,
      userName: req.user.fullName,
      userEmail: req.user.email,
      amount: amount || 25,
      status: 'pending',
      isUpdate: false,
      createdAt: request.createdAt,
    });

    res.status(201).json({ 
      success: true, 
      message: 'تم تسجيل طلب الترقية بنجاح. جاري التحقق الذكي عبر n8n...',
      requestId: request._id 
    });
  } catch (err) {
    console.error('[Upgrade Request Error]', err);
    res.status(500).json({ error: 'فشل في حفظ طلب الترقية. يرجى مراجعة الدعم.' });
  }
});

// ── User: Check upgrade status ──────────────────────────────
router.get('/status', protect, async (req, res) => {
  try {
    const request = await UpgradeRequest.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    const rateLimitStatus = getRateLimitStatus(req.user);
    res.json({
      success: true,
      request: request ? { _id: request._id, status: request.status, createdAt: request.createdAt, rejectionReason: request.rejectionReason } : null,
      plan: req.user.plan,
      isPremium: req.user.isPremium || false,
      failedAttempts: req.user.upgradeFailedAttempts || 0,
      rateLimit: { blocked: rateLimitStatus.blocked, remainMs: rateLimitStatus.remainMs }
    });
  } catch (err) { 
    console.error('[Upgrade Status Error]', err);
    res.status(500).json({ error: 'Failed to fetch status', details: err.message }); 
  }
});

// ── User: Activate PRO (Internal endpoint for n8n success) ───────
router.post('/activate-pro', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.plan = 'pro';
    user.isPremium = true;
    user.paymentStatus = 'approved';
    user.upgradeFailedAttempts = 0;
    user.upgradeLastRejectedAt = null;
    user.upgradeLockedUntil = null;
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

    // Also update any pending requests
    await UpgradeRequest.updateMany(
      { user: user._id, status: 'pending' },
      { status: 'approved', reviewedAt: new Date(), processedBy: 'AI (n8n)' }
    );

    res.json({ success: true, plan: 'pro', paymentStatus: 'approved', message: 'تم تفعيل حسابك بنجاح! 🎉' });
  } catch (err) {
    console.error('[Activate PRO Error]', err);
    res.status(500).json({ error: 'Failed to activate', details: err.message });
  }
});

// ── User: Reject PRO (Internal endpoint for n8n failure) ────────
router.post('/reject-pro', protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.user._id);

    user.upgradeFailedAttempts = (user.upgradeFailedAttempts || 0) + 1;
    user.upgradeLastRejectedAt = new Date();
    user.paymentStatus = 'rejected';
    user.isPremium = false;
    await user.save();

    await UpgradeRequest.updateMany(
      { user: user._id, status: 'pending' },
      { status: 'rejected', rejectionReason: reason || 'فشل التحقق من الدفع الآلي', reviewedAt: new Date(), processedBy: 'AI (n8n)' }
    );

    // Return rate limit info so frontend can show cooldown immediately
    const rlStatus = getRateLimitStatus(user);
    res.json({
      success: true,
      failedAttempts: user.upgradeFailedAttempts,
      maxAttempts: MAX_FAILED_ATTEMPTS,
      rateLimit: {
        blocked: rlStatus.blocked,
        remainMs: rlStatus.remainMs || 0,
        message: rlStatus.message || '',
      },
      message: 'تم تسجيل الرفض',
    });
  } catch (err) {
    console.error('[Reject PRO Error]', err);
    res.status(500).json({ error: 'Failed to reject', details: err.message });
  }
});

// ── Admin: Get all upgrade requests ─────────────────────────
router.get('/admin/all', isAdmin, async (req, res) => {
  try {
    console.log('[UpgradeAdmin] Fetching all requests...');
    const rawRequests = await UpgradeRequest.find()
      .select('-proofImage')
      .populate('user', 'fullName email plan paymentStatus')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`[UpgradeAdmin] DB found ${rawRequests.length} requests.`);

    // Ensure clean JSON conversion to avoid spreading issues
    const cleaned = JSON.parse(JSON.stringify(rawRequests));

    const requestsWithUser = cleaned.map(reqDoc => ({
      ...reqDoc,
      userName: reqDoc.userName || (reqDoc.user ? reqDoc.user.fullName : 'Unknown'),
      userEmail: reqDoc.userEmail || (reqDoc.user ? reqDoc.user.email : 'Unknown'),
      userPlan: reqDoc.user ? reqDoc.user.plan : (reqDoc.status === 'approved' ? 'pro' : 'free')
    }));

    res.json({ success: true, count: requestsWithUser.length, requests: requestsWithUser });
  } catch (err) { 
    console.error('[Admin All Requests Error]', err);
    res.status(500).json({ error: 'Failed to fetch requests', details: err.message }); 
  }
});

// ── Admin: Get single request image ────────────────────────
router.get('/admin/proof/:id', isAdmin, async (req, res) => {
  try {
    const request = await UpgradeRequest.findById(req.params.id).select('proofImage');
    if (!request) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ success: true, proofImage: request.proofImage });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
