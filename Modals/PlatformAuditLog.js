const mongoose = require('mongoose');

const platformAuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, trim: true, index: true },
  targetType: { type: String, required: true, trim: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', default: null, index: true },
  reason: { type: String, default: '', trim: true, maxlength: 1000 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.models.PlatformAuditLog || mongoose.model('PlatformAuditLog', platformAuditLogSchema);
