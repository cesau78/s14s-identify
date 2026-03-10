const mongoose = require('mongoose');

const reviewerSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true }
}, { _id: true });

const sourceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  entra_ad_group: { type: String, default: '' },
  reviewers: [reviewerSchema],
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

sourceSchema.index({ deleted_at: 1 });

const Source = mongoose.model('Source', sourceSchema);

module.exports = Source;
