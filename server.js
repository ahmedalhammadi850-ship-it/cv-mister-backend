// ============================================================
// CV-Mister — Express Server
// High-fidelity Resume SaaS Backend
// ============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const { initSocket } = require('./socketManager');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

// ── Rate Limiters (Production Grade) ────────────────────────
const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 60, 
  message: { error: 'تم تجاوز حد الطلبات العامة. يرجى المحاولة لاحقاً.' }
});

const sensitiveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 40,
  message: { error: 'عملية حساسة: تم رصد طلبات كثيرة جداً. يرجى الانتظار دقيقة.' }
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Initialize Socket.IO & DB ───────────────────────────────
const io = initSocket(server);
connectDB();

// ── Security Headers & Middleware ────────────────────────────
app.use(helmet()); // Secure Headers (XSS, Clickjacking, CSP)
app.use(mongoSanitize()); // Prevent NoSQL Injection
app.use(xss()); // Sanitize User Input against XSS
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Cookies & Session Security (Best Practices) ──────────────
app.use((req, res, next) => {
  res.cookie('__cf_secure', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict'
  });
  next();
});

// Import Routes
const resumeRoutes = require('./routes/resume');
const coverLetterRoutes = require('./routes/coverLetter');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const upgradeRoutes = require('./routes/upgrade');
const { generatePdf } = require('./pdfService');
const Content = require('./models/Content');

// ── Global Request Logger ────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[Incoming Request] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Public Routes (60 req/min) ───────────────────────────────
app.use('/api/content', publicLimiter);
app.get('/api/content', async (req, res) => {
  try {
    const content = await Content.findOne({ key: 'site_settings' });
    res.json({ success: true, settings: content ? content.settings : null });
  } catch (error) {
    console.error('[Content Fetch Error]', error);
    res.status(500).json({ error: 'Failed to fetch content', details: error.message });
  }
});

// ── Sensitive Routes (12 req/min) ────────────────────────────
app.use('/api/auth', sensitiveLimiter);
app.use('/api/upgrade', sensitiveLimiter);
app.use('/api/payments', sensitiveLimiter);

// ── API Routes ──────────────────────────────────────────────
app.use('/api/resumes', resumeRoutes);
app.use('/api/cover-letters', coverLetterRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upgrade', upgradeRoutes);
app.use('/api/payments', require('./routes/payments'));
app.use('/api/contact', require('./routes/contact'));

// ── DIRECT ROUTE: Deactivate PRO (bypasses router for reliability) ───
const { isAdmin } = require('./middleware/isAdmin');
const User = require('./models/User'); // Corrected path to ./models/User

// ── Admin: Template Management (Direct Access) ───────────────
app.get('/api/admin/templates/settings', isAdmin, async (req, res) => {
  try {
    const content = await Content.findOne({ key: 'site_settings' });
    res.json({ success: true, templates: content?.settings?.templates || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template settings' });
  }
});

app.post('/api/admin/templates/update', isAdmin, async (req, res) => {
  try {
    const { templateId, enabled, isPremium } = req.body;
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
    
    // Broadcast update to all users
    const { getIO } = require('./socketManager');
    const io = getIO();
    if (io) io.emit('settingsUpdate', { type: 'templates', templates: content.settings.templates });

    res.json({ success: true, message: 'تم تحديث القالب بنجاح', templates: content.settings.templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

app.post('/api/admin/templates/update-bulk', isAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    let content = await Content.findOne({ key: 'site_settings' });
    if (!content) {
      content = new Content({ key: 'site_settings', settings: { templates: updates } });
    } else {
      content.settings.templates = { ...(content.settings.templates || {}), ...updates };
      content.markModified('settings');
    }
    await content.save();

    // Broadcast update to all users
    const { getIO } = require('./socketManager');
    const io = getIO();
    if (io) io.emit('settingsUpdate', { type: 'templates', templates: content.settings.templates });

    res.json({ success: true, message: 'تم تحديث القوالب بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update templates' });
  }
});

app.put('/api/admin/deactivate-pro/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.plan = 'free';
    user.paymentStatus = 'none';
    await user.save();
    res.json({ success: true, message: 'تم إلغاء تفعيل باقة Pro للمستخدم بنجاح ❌', data: { plan: 'free' } });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإلغاء' });
  }
});

// ── PDF Generation Endpoint ──────────────────────────────────
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { html, css } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML content is required' });
    const pdfBuffer = await generatePdf(html, css);
    res.status(200).set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length
    }).end(pdfBuffer, 'binary');
  } catch (err) {
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// ── Health Check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ── Error Handling ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 CV-Mister Backend SECURE running on http://localhost:${PORT}`);
});
