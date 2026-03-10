const mongoose = require('mongoose');
const aliasSchema = require('./alias');
const changeRecordSchema = require('./changeRecord');
const { generateSearchTokens } = require('../services/searchTokenService');

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
  merged_into: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null }
}, {
  timestamps: false,
  versionKey: false
});

customerSchema.pre('save', function () {
  this.search_tokens = generateSearchTokens({
    first_name: this.first_name,
    last_name: this.last_name,
    email: this.email,
    phone: this.phone,
    address: this.address
  });
});

customerSchema.index({ deleted_at: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ 'aliases.source_system': 1, 'aliases.source_key': 1 });
customerSchema.index({ search_tokens: 1, deleted_at: 1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
