const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'site_settings'
  },
  settings: {
    type: Object,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Content', contentSchema);
