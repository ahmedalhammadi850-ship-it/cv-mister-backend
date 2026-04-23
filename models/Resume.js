// ============================================================
// CV-Mister — MongoDB Resume Schema
// Highly flexible with nested arrays and version control
// ============================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Sub-schemas ─────────────────────────────────────────────
const PersonalInfoSchema = new Schema({
  fullName:  { type: String, default: '' },
  jobTitle:  { type: String, default: '' },
  email:     { type: String, default: '' },
  phone:     { type: String, default: '' },
  location:  { type: String, default: '' },
  website:   { type: String, default: '' },
  linkedin:  { type: String, default: '' },
  github:    { type: String, default: '' },
  photo:     { type: String, default: '' },
}, { _id: false });

const ExperienceSchema = new Schema({
  id:          { type: String, required: true },
  company:     { type: String, default: '' },
  position:    { type: String, default: '' },
  location:    { type: String, default: '' },
  startDate:   { type: String, default: '' },
  endDate:     { type: String, default: '' },
  description: { type: String, default: '' },
}, { _id: false });

const EducationSchema = new Schema({
  id:          { type: String, required: true },
  institution: { type: String, default: '' },
  degree:      { type: String, default: '' },
  location:    { type: String, default: '' },
  startDate:   { type: String, default: '' },
  endDate:     { type: String, default: '' },
  description: { type: String, default: '' },
}, { _id: false });

const SkillSchema = new Schema({
  id:    { type: String, required: true },
  name:  { type: String, default: '' },
  level: { type: Number, default: 80 },
}, { _id: false });

const ProjectSchema = new Schema({
  id:           { type: String, required: true },
  name:         { type: String, default: '' },
  description:  { type: String, default: '' },
  technologies: { type: String, default: '' },
  link:         { type: String, default: '' },
}, { _id: false });

const LanguageSchema = new Schema({
  id:    { type: String, required: true },
  name:  { type: String, default: '' },
  level: { type: String, default: '' },
}, { _id: false });

const CertificateSchema = new Schema({
  id:     { type: String, required: true },
  name:   { type: String, default: '' },
  issuer: { type: String, default: '' },
  date:   { type: String, default: '' },
}, { _id: false });

const AwardSchema = new Schema({
  id:          { type: String, required: true },
  name:        { type: String, default: '' },
  issuer:      { type: String, default: '' },
  date:        { type: String, default: '' },
  description: { type: String, default: '' },
}, { _id: false });

const VolunteerSchema = new Schema({
  id:           { type: String, required: true },
  organization: { type: String, default: '' },
  role:         { type: String, default: '' },
  startDate:    { type: String, default: '' },
  endDate:      { type: String, default: '' },
  description:  { type: String, default: '' },
}, { _id: false });

const ReferenceSchema = new Schema({
  id:       { type: String, required: true },
  name:     { type: String, default: '' },
  position: { type: String, default: '' },
  email:    { type: String, default: '' },
  phone:    { type: String, default: '' },
}, { _id: false });

const CustomSectionSchema = new Schema({
  id:      { type: String, required: true },
  title:   { type: String, default: '' },
  content: { type: String, default: '' },
}, { _id: false });

// ── Version sub-schema ──────────────────────────────────────
const VersionSchema = new Schema({
  version: { type: Number, required: true },
  data:    { type: Schema.Types.Mixed },
  savedAt: { type: Date, default: Date.now },
  label:   { type: String, default: '' },
}, { _id: false });

// ── Main Resume Schema ─────────────────────────────────────
const ResumeSchema = new Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:      { type: String, default: 'Untitled Resume' },
  templateId: {
    type: String,
    enum: [
      'simple', 'professional', 'elegant', 'creative', 'classic', 
      'minimalist', 'tech', 'executive', 'academic', 'modern_sidebar',
      'refined', 'slate', 'border_grid', 'gradient_top', 'compact',
      'classic_corporate', 'modern_split', 'executive_line',
      'legacy_clean', 'minimal_bold', 'subtle_bar', 'sky_split', 'ocean_blue'
    ],
    default: 'professional',
  },
  category: {
    type: String,
    enum: ['chronological', 'functional', 'combination', 'executive', 'academic', 'entry_level'],
    default: 'chronological',
  },
  language: { type: String, default: 'en' },

  // Version control
  version:  { type: Number, default: 1 },
  versions: [VersionSchema],

  // Nested content
  content: {
    personalInfo:   { type: PersonalInfoSchema, default: () => ({}) },
    summary:        { type: String, default: '' },
    experience:     [ExperienceSchema],
    education:      [EducationSchema],
    skills:         [SkillSchema],
    projects:       [ProjectSchema],
    languages:      [LanguageSchema],
    certificates:   [CertificateSchema],
    awards:         [AwardSchema],
    volunteering:   [VolunteerSchema],
    references:     [ReferenceSchema],
    customSections: [CustomSectionSchema],
    sectionOrder:   [String],
  },

  // Style configuration
  styleConfig: {
    accentColor:    { type: String, default: '#1E3A5F' },
    fontSize:       { type: Number, default: 10.5 },
    lineHeight:     { type: Number, default: 1.5 },
    marginTop:      { type: Number, default: 20 },
    marginBottom:   { type: Number, default: 20 },
    marginSides:    { type: Number, default: 15 },
    sectionGap:     { type: Number, default: 16 },
    headerFontSize: { type: Number, default: 22 },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { strict: false });

// Auto-update timestamp
ResumeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Resume', ResumeSchema);
