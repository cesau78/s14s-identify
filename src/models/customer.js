const mongoose = require('mongoose');
const aliasSchema = require('./alias');
const changeRecordSchema = require('./changeRecord');

const customerSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' }
  },
  aliases: [aliasSchema],
  change_history: [changeRecordSchema],
  created_by: { type: String, required: true },
  created_at: { type: Date, required: true, default: Date.now },
  updated_by: { type: String, default: null },
  updated_at: { type: Date, default: null },
  deleted_by: { type: String, default: null },
  deleted_at: { type: Date, default: null },
  search_tokens: [{ type: String }],
  pending_matches: [{
    candidate_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    confidence: { type: Number, required: true },
    algorithm: { type: String, default: 'fellegi-sunter' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewed_by: { type: String, default: null },
    reviewed_at: { type: Date, default: null }
  }],
  merged_into: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null }
}, {
  timestamps: false,
  versionKey: false
});

customerSchema.index({ deleted_at: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ 'aliases.source_system': 1, 'aliases.source_key': 1 });
customerSchema.index({ search_tokens: 1, deleted_at: 1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
