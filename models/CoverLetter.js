// ============================================================
// CV-Mister — CoverLetter Model
// Schema for cover letter persistence
// ============================================================

const mongoose = require('mongoose');

const coverLetterSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'Untitled Cover Letter' },
  content: {
    recipientName: String,
    recipientTitle: String,
    companyName: String,
    companyAddress: String,
    date: { type: String, default: new Date().toLocaleDateString() },
    subject: String,
    body: String,
  },
  templateId: { type: String, default: 'professional' },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' }, // Link to a specific resume
  metadata: {
    accentColor: String,
    language: { type: String, default: 'en' },
  }
}, { timestamps: true });

module.exports = mongoose.model('CoverLetter', coverLetterSchema);
