const mongoose = require('mongoose');

const academySubscriptionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformPlan', required: true },
  status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'], default: 'trialing', index: true },
  billingCycle: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  amount: { type: Number, min: 0, required: true },
  currency: { type: String, default: 'INR', uppercase: true },
  startsAt: { type: Date, default: Date.now },
  currentPeriodEnd: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  provider: { type: String, default: 'manual', enum: ['manual', 'razorpay', 'stripe'] },
  providerCustomerId: { type: String, default: '' },
  providerSubscriptionId: { type: String, default: '' },
}, { timestamps: true });

academySubscriptionSchema.index({ academyId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.models.AcademySubscription || mongoose.model('AcademySubscription', academySubscriptionSchema);
