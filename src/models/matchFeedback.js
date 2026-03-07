const mongoose = require('mongoose');

const matchFeedbackSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['false_positive', 'false_negative']
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  related_customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  alias_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  original_confidence: {
    type: Number,
    default: null
  },
  original_algorithm: {
    type: String,
    default: null
  },
  reported_by: {
    type: String,
    required: true
  },
  reported_at: {
    type: Date,
    required: true,
    default: Date.now
  },
  resolved: {
    type: Boolean,
    default: false
  },
  resolved_at: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: false,
  versionKey: false
});

matchFeedbackSchema.index({ type: 1 });
matchFeedbackSchema.index({ customer_id: 1 });
matchFeedbackSchema.index({ resolved: 1 });

const MatchFeedback = mongoose.model('MatchFeedback', matchFeedbackSchema);

module.exports = MatchFeedback;
