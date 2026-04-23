// ============================================================
// CV-Mister — Cover Letter API Routes
// CRUD for cover letters
// ============================================================

const express = require('express');
const router = express.Router();
const CoverLetter = require('../models/CoverLetter');
const { protect } = require('../middleware/auth');

// ── GET /api/cover-letters — List all ───────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const letters = await CoverLetter.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json(letters);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cover letters', details: err.message });
  }
});

// ── POST /api/cover-letters — Create new ────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const letter = new CoverLetter({ ...req.body, userId: req.user._id });
    const saved = await letter.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create cover letter', details: err.message });
  }
});

// ── GET /api/cover-letters/:id — Get one ────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const letter = await CoverLetter.findOne({ _id: req.params.id, userId: req.user._id });
    if (!letter) return res.status(404).json({ error: 'Not found' });
    res.json(letter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch letter', details: err.message });
  }
});

// ── PUT /api/cover-letters/:id — Update ─────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const saved = await CoverLetter.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update letter', details: err.message });
  }
});

// ── DELETE /api/cover-letters/:id — Delete ──────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const deleted = await CoverLetter.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete letter', details: err.message });
  }
});

module.exports = router;
