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
  source_of_truth: { type: Boolean, default: false },
  effective_date: { type: Date, default: Date.now },
  first_name: { type: String, default: '' },
  last_name: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' }
  },
  candidates: [candidateSchema]
}, { _id: true });

module.exports = aliasSchema;
