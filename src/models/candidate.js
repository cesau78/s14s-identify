const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  confidence: { type: Number, required: true },
  algorithm: { type: String, default: 'fellegi-sunter' },
  search_tokens: [{ type: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewed_by: { type: String, default: null },
  reviewed_at: { type: Date, default: null }
}, { _id: true });

module.exports = candidateSchema;
