const mongoose = require('mongoose');

const changeRecordSchema = new mongoose.Schema({
  changed_by: { type: String, required: true },
  changed_at: { type: Date, required: true, default: Date.now },
  delta: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

module.exports = changeRecordSchema;
