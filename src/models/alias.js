const mongoose = require('mongoose');
const candidateSchema = require('./candidate');

const aliasSchema = new mongoose.Schema({
  source_system: { type: String, required: true },
  source_key: { type: String, required: true },
  original_payload: { type: mongoose.Schema.Types.Mixed, required: true },
  added_by: { type: String, required: true },
  added_at: { type: Date, required: true, default: Date.now },
  match_confidence: { type: Number, default: null },
  match_algorithm: { type: String, default: null },
  candidates: [candidateSchema]
}, { _id: true });

module.exports = aliasSchema;
