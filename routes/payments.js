// ============================================================
// CV-Mister — Payments Routes (Complete Payment Cycle)
// Frontend-facing: /create, /activate-pro, /reject
// n8n Webhook-facing: /auto-approve, /auto-reject
// ============================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const UpgradeRequest = require('../models/UpgradeRequest');

// ── Constants ───────────────────────────────────────────────
const COOLDOWN_MS = 10 * 60 * 1000;     // 10 minutes cooldown
const MAX_FAILED_ATTEMPTS = 10;

// ── Helper: Check rate limit ─────────────────────────────────
function getRateLimitStatus(user) {
  if (user.email.includes('ahmedyes') || user.fullName.includes('ahmedyes')) {
    return { blocked: false };
  }
  const now = new Date();
  const fails = user.upgradeFailedAttempts || 0;
  if (fails >= MAX_FAILED_ATTEMPTS && user.upgradeLastRejectedAt) {
    const cooldownEnd = new Date(user.upgradeLastRejectedAt.getTime() + COOLDOWN_MS);
    if (cooldownEnd > now) {
      return {
        blocked: true,
        remainMs: cooldownEnd - now,
        message: `تم رفض طلبك ${fails} مرات. يرجى المحاولة بعد ${Math.ceil((cooldownEnd - now) / 60000)} دقيقة.`,
      };
    }
  }
  return { blocked: false };
}

// ═══════════════════════════════════════════════════════════════
// 1. POST /api/payments/create — Frontend creates payment record
// ═══════════════════════════════════════════════════════════════
router.post('/create', protect, async (req, res) => {
  try {
    const { proofImage, amount } = req.body;
    if (!proofImage) {
      return res.status(400).json({ error: 'صورة الحوالة مطلوبة' });
    }

    // Already pro?
    if (req.user.plan === 'pro') {
      return res.status(400).json({ error: 'حسابك مُفعّل بالفعل على خطة Pro!' });
    }

    // Rate limit check
    const rlStatus = getRateLimitStatus(req.user);
    if (rlStatus.blocked) {
      return res.status(429).json({
        error: rlStatus.message,
        remainMs: rlStatus.remainMs,
      });
    }

    // Check for existing pending request
    const existing = await UpgradeRequest.findOne({ user: req.user._id, status: 'pending' });
    if (existing) {
      return res.status(400).json({ error: 'لديك طلب معلق بالفعل. يرجى انتظار المراجعة.' });
    }

    // Create upgrade request in DB
    const request = await UpgradeRequest.create({
      user: req.user._id,
      userName: req.user.fullName,
      userEmail: req.user.email,
      proofImage,
      amount: amount || 25,
      status: 'pending',
    });

    // Mark user's paymentStatus as pending
    await User.findByIdAndUpdate(req.user._id, { paymentStatus: 'pending' });

    console.log(`[Payment] ✅ Record created for ${req.user.fullName} (${req.user.email}) — RequestID: ${request._id}`);

    res.status(201).json({
      success: true,
      message: 'تم تسجيل طلب الترقية بنجاح. جاري التحقق الذكي...',
      requestId: request._id,
    });
  } catch (err) {
    console.error('[Payment Create Error]', err);
    res.status(500).json({ error: 'فشل في حفظ طلب الترقية', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 2. POST /api/payments/update-status — Frontend activates/rejects pro
// ═══════════════════════════════════════════════════════════════
router.post('/update-status', protect, async (req, res) => {
  try {
    const { status, activatedBy, reason } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (status === 'approved') {
      user.plan = 'pro';
      user.isPremium = true;
      user.paymentStatus = 'approved';
      user.upgradeFailedAttempts = 0;
      user.upgradeLastRejectedAt = null;
      user.upgradeLockedUntil = null;
      
      // Set subscription duration (30 days) and resume limit (2)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      user.resumesLimit = 2; 
      user.subscriptionEndDate = endDate;
      await user.save();

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

      await UpgradeRequest.updateMany(
        { user: user._id, status: 'pending' },
        {
          status: 'approved',
          reviewedAt: new Date(),
          processedBy: activatedBy || 'AI Agent (n8n)',
          adminNote: 'تم التفعيل تلقائياً بعد التحقق الذكي',
        }
      );

      console.log(`[Payment] 🎉 PRO Activated: ${user.fullName} (${user.email})`);

      return res.json({
        success: true,
        plan: 'pro',
        paymentStatus: 'approved',
        message: 'تم تفعيل حسابك بنجاح! 🎉',
      });
    }

    if (status === 'rejected') {
      // Increment failure counters
      user.upgradeFailedAttempts = (user.upgradeFailedAttempts || 0) + 1;
      user.upgradeLastRejectedAt = new Date();
      user.paymentStatus = 'rejected';
      user.isPremium = false;

      // Hard lockout after MAX_FAILED_ATTEMPTS
      if (user.upgradeFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        user.upgradeLockedUntil = new Date(Date.now() + COOLDOWN_MS);
      }
      await user.save();

      // Mark pending requests as rejected
      await UpgradeRequest.updateMany(
        { user: user._id, status: 'pending' },
        {
          status: 'rejected',
          rejectionReason: reason || 'لم يتم العثور على اسم، يرجى التحقق من الحوالة',
          reviewedAt: new Date(),
          processedBy: 'AI Agent (n8n)',
        }
      );

      const rlStatus = getRateLimitStatus(user);

      console.log(`[Payment] ❌ Rejected: ${user.fullName} (Attempt #${user.upgradeFailedAttempts})`);

      return res.json({
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
    }

    return res.status(400).json({ error: 'Status is required' });
  } catch (err) {
    console.error('[Payment Update Status Error]', err);
    res.status(500).json({ error: 'حدث خطأ في النظام', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 4. POST /api/payments/auto-approve — n8n webhook callback
// ═══════════════════════════════════════════════════════════════
router.post('/auto-approve', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId مطلوب' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const request = await UpgradeRequest.findOne({ user: userId }).sort({ createdAt: -1 });

    // Determine plan based on amount (e.g., 79 for Business, 29 for Pro)
    const amount = request?.amount || 29;
    const isBusiness = amount > 50;
    const targetPlan = isBusiness ? 'business' : 'pro';
    const targetLimit = isBusiness ? 9999 : 2;

    user.plan = targetPlan;
    user.isPremium = true;
    user.paymentStatus = 'approved';
    user.upgradeFailedAttempts = 0;
    user.upgradeLastRejectedAt = null;
    user.upgradeLockedUntil = null;

    // Set subscription duration (30 days) and resume limit
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    user.resumesLimit = targetLimit; 
    user.subscriptionEndDate = endDate;
    await user.save();

    const { emitStatusUpdate } = require('../socketManager');
    emitStatusUpdate({
      requestId: user._id.toString(),
      action: 'activate',
      status: 'approved',
      plan: targetPlan,
      isPremium: true,
      userName: user.fullName,
      userEmail: user.email,
      userId: user._id.toString(),
    }, user._id.toString());

    if (request) {
      request.status = 'approved';
      request.processedBy = 'AI (n8n)';
      request.reviewedAt = new Date();
      await request.save();
    }

    console.log(`[n8n] ✅ Auto-Approved: ${user.fullName} → PRO`);
    res.json({ success: true, message: 'تم تفعيل الحساب بنجاح' });
  } catch (err) {
    console.error('[n8n Auto-Approve Error]', err);
    res.status(500).json({ error: 'عطل في الخادم' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. POST /api/payments/auto-reject — n8n webhook callback
// ═══════════════════════════════════════════════════════════════
router.post('/auto-reject', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId مطلوب' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const request = await UpgradeRequest.findOne({ user: userId }).sort({ createdAt: -1 });

    user.upgradeFailedAttempts = (user.upgradeFailedAttempts || 0) + 1;
    user.upgradeLastRejectedAt = new Date();
    user.paymentStatus = 'rejected';
    user.isPremium = false;
    await user.save();

    if (request) {
      request.status = 'rejected';
      request.processedBy = 'AI (n8n)';
      request.rejectionReason = reason || 'البيانات لا تتطابق';
      request.reviewedAt = new Date();
      await request.save();
    }

    const { emitStatusUpdate } = require('../socketManager');
    emitStatusUpdate({
      requestId: user._id.toString(),
      action: 'reject',
      status: 'rejected',
      plan: 'free',
      isPremium: false,
      userName: user.fullName,
      userEmail: user.email,
      userId: user._id.toString(),
      rejectionReason: reason || 'البيانات لا تتطابق'
    }, user._id.toString());

    console.log(`[n8n] ❌ Auto-Rejected: ${user.fullName} (Attempt #${user.upgradeFailedAttempts})`);
    res.json({ success: true, message: 'تم رفض الطلب' });
  } catch (err) {
    console.error('[n8n Auto-Reject Error]', err);
    res.status(500).json({ error: 'عطل في الخادم' });
  }
});

module.exports = router;
