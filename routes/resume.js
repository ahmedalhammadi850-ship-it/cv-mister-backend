// ============================================================
// CV-Mister — Resume API Routes
// CRUD + Version Control + PDF Export
// ============================================================

const express = require('express');
const router = express.Router();
const Resume = require('../models/Resume');
const Content = require('../models/Content');
const { protect } = require('../middleware/auth');

router.post('/', protect, async (req, res) => {
  try {
    const Resume = require('../models/Resume');
    const User = require('../models/User');

    // 1. Get fresh user data from DB (to get latest credits & subscription info)
    const freshUser = await User.findById(req.user._id);
    if (!freshUser) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const isPro = freshUser.plan !== 'free';

    // 2. Check subscription expiry for Pro users
    if (isPro && freshUser.subscriptionEndDate) {
      const now = new Date();
      if (new Date(freshUser.subscriptionEndDate) < now) {
        // Subscription expired — auto-downgrade to free
        freshUser.plan = 'free';
        freshUser.isPremium = false;
        freshUser.paymentStatus = 'none';
        freshUser.resumeCredits = 0;
        await freshUser.save();
        return res.status(403).json({
          error: 'انتهت صلاحية اشتراكك. يرجى تجديد الاشتراك لإنشاء سير ذاتية جديدة.',
          code: 'SUBSCRIPTION_EXPIRED'
        });
      }
    }

    // 3. Check global free access toggle (only for free users)
    if (!isPro) {
      const siteContent = await Content.findOne({ key: 'site_settings' });
      const settings = siteContent?.settings || {};
      const isFreeAllowed = settings.isFreeAllowed !== false;

      if (!isFreeAllowed) {
        return res.status(403).json({ 
          error: 'تم تعطيل إنشاء السير الذاتية المجانية من قبل الإدارة. يرجى الترقية إلى Pro للبدء.',
          code: 'LIMIT_REACHED'
        });
      }
    }

    // 4. Credit-based system: Check if user has credits to create a new resume
    const credits = freshUser.resumeCredits || 0;

    if (credits <= 0) {
      return res.status(403).json({ 
        error: 'رصيدك من السير الذاتية قد نفد. يرجى الدفع للحصول على رصيد إضافي.',
        code: 'CREDITS_EXHAUSTED',
        resumeCredits: 0
      });
    }

    // 5. Premium template check (Now Dynamic)
    if (req.body.templateId && !isPro) {
      const siteContent = await Content.findOne({ key: 'site_settings' });
      const templates = siteContent?.settings?.templates || {};
      const templateSettings = templates[req.body.templateId];

      // If template is explicitly marked as premium OR if it's not 'simple' (fallback)
      const isTemplatePremium = templateSettings 
        ? templateSettings.isPremium 
        : (req.body.templateId !== 'simple');

      if (isTemplatePremium) {
        return res.status(403).json({ error: 'هذا القالب مخصص للمشتركين فقط. يرجى الترقية إلى Pro لاستخدامه.' });
      }

      // Check if template is enabled
      const isEnabled = templateSettings ? templateSettings.enabled : true;
      if (!isEnabled) {
        return res.status(403).json({ error: 'هذا القالب غير متاح حالياً.' });
      }
    }

    const resume = new Resume({
      userId: req.user._id,
      title: req.body.title || 'Untitled Resume',
      content: req.body.content || {},
      metadata: req.body.metadata || {},
      templateId: req.body.templateId || 'professional',
      category: req.body.category || 'chronological',
      styleConfig: req.body.styleConfig || {},
      version: 1,
      versions: [{
        version: 1,
        data: req.body.content || {},
        savedAt: new Date(),
        label: 'Initial version',
      }],
    });

    const saved = await resume.save();

    // ── Deduct 1 credit after successful save ─────────────────
    freshUser.resumeCredits = Math.max((freshUser.resumeCredits || 0) - 1, 0);

    // If credits reach 0, immediately downgrade to free
    if (freshUser.resumeCredits <= 0) {
      freshUser.plan = 'free';
      freshUser.isPremium = false;
      freshUser.paymentStatus = 'none';
    }
    await freshUser.save();

    // Emit real-time update so frontend syncs immediately
    try {
      const { emitStatusUpdate } = require('../socketManager');
      emitStatusUpdate({
        requestId: freshUser._id.toString(),
        action: freshUser.resumeCredits <= 0 ? 'deactivate' : 'credit-update',
        status: freshUser.resumeCredits <= 0 ? 'none' : 'approved',
        plan: freshUser.plan,
        isPremium: freshUser.isPremium,
        resumeCredits: freshUser.resumeCredits,
        resumesLimit: freshUser.resumesLimit,
        userName: freshUser.fullName,
        userEmail: freshUser.email,
        userId: freshUser._id.toString(),
      }, freshUser._id.toString());
    } catch (socketErr) {
      console.warn('[Socket] Failed to emit credit update:', socketErr.message);
    }

    // Include remaining credits in the response
    res.status(201).json({ ...saved.toObject(), remainingCredits: freshUser.resumeCredits });
  } catch (err) {
    console.error('Create resume error:', err.message);
    res.status(500).json({ error: 'Failed to create resume', details: err.message });
  }
});

// ── GET /api/resumes — List all resumes ─────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const resumes = await Resume.find({ userId: req.user._id })
      .select('title templateId category updatedAt createdAt content.personalInfo.fullName')
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(resumes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list resumes', details: err.message });
  }
});

// ── GET /api/resumes/:id — Get resume by ID ─────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get resume', details: err.message });
  }
});

// ── PUT /api/resumes/:id — Update resume (auto-version) ─────
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.body.templateId && req.user.plan !== 'pro') {
      const siteContent = await Content.findOne({ key: 'site_settings' });
      const templates = siteContent?.settings?.templates || {};
      const templateSettings = templates[req.body.templateId];
      const isTemplatePremium = templateSettings ? templateSettings.isPremium : (req.body.templateId !== 'simple');

      if (isTemplatePremium) {
        return res.status(403).json({ error: 'هذا القالب مخصص للمشتركين فقط. يرجى الترقية إلى Pro.' });
      }
    }

    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // Increment version
    resume.version += 1;

    // Save current state as a version snapshot
    resume.versions.push({
      version: resume.version,
      data: req.body.content || resume.content,
      savedAt: new Date(),
      label: req.body.versionLabel || `Auto-save v${resume.version}`,
    });

    // Keep only last 20 versions to save space
    if (resume.versions.length > 20) {
      resume.versions = resume.versions.slice(-20);
    }

    // Update content
    if (req.body.content) resume.content = req.body.content;
    if (req.body.title) resume.title = req.body.title;
    if (req.body.templateId) resume.templateId = req.body.templateId;
    if (req.body.category) resume.category = req.body.category;
    if (req.body.styleConfig) resume.styleConfig = req.body.styleConfig;
    if (req.body.metadata) resume.metadata = req.body.metadata;

    const saved = await resume.save();
    res.json(saved);
  } catch (err) {
    console.error('Update resume error:', err.message);
    res.status(500).json({ error: 'Failed to update resume', details: err.message });
  }
});

// ── GET /api/resumes/:id/versions — Get version history ─────
router.get('/:id/versions', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id).select('versions version');
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({
      currentVersion: resume.version,
      versions: resume.versions.map((v) => ({
        version: v.version,
        savedAt: v.savedAt,
        label: v.label,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get versions', details: err.message });
  }
});

// ── PUT /api/resumes/:id/restore/:version — Restore version ─
router.put('/:id/restore/:version', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    const targetVersion = parseInt(req.params.version);
    const versionData = resume.versions.find((v) => v.version === targetVersion);
    if (!versionData) return res.status(404).json({ error: `Version ${targetVersion} not found` });

    // Restore content from version snapshot
    resume.content = versionData.data;
    resume.version += 1;
    resume.versions.push({
      version: resume.version,
      data: versionData.data,
      savedAt: new Date(),
      label: `Restored from v${targetVersion}`,
    });

    const saved = await resume.save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore version', details: err.message });
  }
});

// ── POST /api/resumes/:id/export — Export as PDF ────────────
router.post('/:id/export', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // Return resume data for client-side PDF generation
    // (Puppeteer PDF generation handled separately in pdfService.js)
    res.json({
      message: 'Use /generate-pdf endpoint with resume data for PDF export',
      resumeId: resume._id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to export resume', details: err.message });
  }
});

// ── DELETE /api/resumes/:id — Delete resume ─────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({ message: 'Resume deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete resume', details: err.message });
  }
});

// ── GET /api/resumes/:id/public — Get resume publicly for PDF generation ──
router.get('/:id/public', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get resume', details: err.message });
  }
});

module.exports = router;
