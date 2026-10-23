const mongoose = require('mongoose');

const platformPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true, lowercase: true, unique: true },
  description: { type: String, default: '' },
  monthlyPrice: { type: Number, required: true, min: 0, default: 0 },
  annualPrice: { type: Number, required: true, min: 0, default: 0 },
  trialDays: { type: Number, min: 0, default: 0 },
  limits: {
    students: { type: Number, min: -1, default: 100 },
    courses: { type: Number, min: -1, default: 10 },
    batches: { type: Number, min: -1, default: 20 },
    staff: { type: Number, min: -1, default: 10 },
    branches: { type: Number, min: -1, default: 1 },
  },
  features: [{ type: String, trim: true }],
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

module.exports = mongoose.models.PlatformPlan || mongoose.model('PlatformPlan', platformPlanSchema);
