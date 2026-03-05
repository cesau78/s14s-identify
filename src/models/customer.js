const mongoose = require('mongoose');

const changeRecordSchema = new mongoose.Schema({
  changed_by: { type: String, required: true },
  changed_at: { type: Date, required: true, default: Date.now },
  delta: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

const aliasSchema = new mongoose.Schema({
  source_system: { type: String, required: true },
  source_key: { type: String, required: true },
  original_payload: { type: mongoose.Schema.Types.Mixed, required: true },
  added_by: { type: String, required: true },
  added_at: { type: Date, required: true, default: Date.now }
}, { _id: true });

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
  deleted_at: { type: Date, default: null }
}, {
  timestamps: false,
  versionKey: false
});

customerSchema.index({ deleted_at: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ 'aliases.source_system': 1, 'aliases.source_key': 1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
