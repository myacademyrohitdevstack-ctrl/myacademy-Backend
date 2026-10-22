const mongoose = require('mongoose');

const parentStudentSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  relationship: { type: String, enum: ['mother', 'father', 'guardian', 'other'], default: 'guardian' },
  isPrimary: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

parentStudentSchema.index({ academyId: 1, parentId: 1, studentUserId: 1 }, { unique: true });
module.exports = mongoose.models.ParentStudent || mongoose.model('ParentStudent', parentStudentSchema);
