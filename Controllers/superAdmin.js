const mongoose = require('mongoose');
const asyncHandler = require('../Utils/asyncHandler');
const Academy = require('../Modals/Academy');
const User = require('../Modals/User');
const PlatformPlan = require('../Modals/PlatformPlan');
const AcademySubscription = require('../Modals/AcademySubscription');
const PlatformAuditLog = require('../Modals/PlatformAuditLog');

const audit = (req, action, targetType, targetId, academyId = null, reason = '', metadata = {}) => PlatformAuditLog.create({
  actorId: req.user._id, action, targetType, targetId: targetId || null, academyId,
  reason, metadata, ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '',
});

const getDashboard = asyncHandler(async (req, res) => {
  const [totalAcademies, activeAcademies, suspendedAcademies, totalUsers, activeSubscriptions, trials, plans] = await Promise.all([
    Academy.countDocuments({ isDeleted: false }),
    Academy.countDocuments({ isDeleted: false, status: 'active' }),
    Academy.countDocuments({ isDeleted: false, status: 'suspended' }),
    User.countDocuments({ isDeleted: false, platformRole: { $ne: 'super_admin' } }),
    AcademySubscription.countDocuments({ status: 'active' }),
    AcademySubscription.countDocuments({ status: 'trialing' }),
    PlatformPlan.countDocuments({ isActive: true }),
  ]);
  const recentAcademies = await Academy.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(8).select('name slug email phone owner plan status createdAt').populate('owner', 'fullName email');
  const subscriptionsByStatus = await AcademySubscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  res.json({ success: true, data: { metrics: { totalAcademies, activeAcademies, suspendedAcademies, totalUsers, activeSubscriptions, trials, activePlans: plans }, subscriptionsByStatus, recentAcademies } });
});

const listAcademies = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const regex = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }, { slug: regex }];
  }
  const [academies, total] = await Promise.all([
    Academy.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('owner', 'fullName email phone'),
    Academy.countDocuments(filter),
  ]);
  res.json({ success: true, academies, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const setAcademyStatus = asyncHandler(async (req, res) => {
  const { status, reason = '' } = req.body;
  if (!['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ success: false, message: 'status must be active, inactive, or suspended.' });
  if (status === 'suspended' && !String(reason).trim()) return res.status(400).json({ success: false, message: 'A reason is required when suspending an academy.' });
  if (!mongoose.isValidObjectId(req.params.academyId)) return res.status(400).json({ success: false, message: 'Invalid academy ID.' });
  const academy = await Academy.findOneAndUpdate({ _id: req.params.academyId, isDeleted: false }, { $set: { status } }, { new: true, runValidators: true });
  if (!academy) return res.status(404).json({ success: false, message: 'Academy not found.' });
  await audit(req, `academy.${status}`, 'Academy', academy._id, academy._id, reason);
  res.json({ success: true, message: `Academy ${status}.`, academy });
});

const listPlans = asyncHandler(async (req, res) => {
  const plans = await PlatformPlan.find().sort({ monthlyPrice: 1, name: 1 });
  res.json({ success: true, plans });
});

const createPlan = asyncHandler(async (req, res) => {
  const { name, code, description = '', monthlyPrice, annualPrice, trialDays = 0, limits = {}, features = [], isActive = true } = req.body;
  if (!name || !code || monthlyPrice === undefined || annualPrice === undefined) return res.status(400).json({ success: false, message: 'name, code, monthlyPrice, and annualPrice are required.' });
  const plan = await PlatformPlan.create({ name, code, description, monthlyPrice, annualPrice, trialDays, limits, features, isActive });
  await audit(req, 'plan.created', 'PlatformPlan', plan._id, null, '', { code: plan.code });
  res.status(201).json({ success: true, plan });
});

const updatePlan = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.planId)) return res.status(400).json({ success: false, message: 'Invalid plan ID.' });
  const allowed = ['name', 'description', 'monthlyPrice', 'annualPrice', 'trialDays', 'limits', 'features', 'isActive'];
  const update = {};
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
  const plan = await PlatformPlan.findByIdAndUpdate(req.params.planId, { $set: update }, { new: true, runValidators: true });
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
  await audit(req, 'plan.updated', 'PlatformPlan', plan._id, null, '', { changedFields: Object.keys(update) });
  res.json({ success: true, plan });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [subscriptions, total] = await Promise.all([
    AcademySubscription.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('academyId', 'name slug email status').populate('planId', 'name code monthlyPrice annualPrice'),
    AcademySubscription.countDocuments(filter),
  ]);
  res.json({ success: true, subscriptions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const assignSubscription = asyncHandler(async (req, res) => {
  const { academyId, planId, billingCycle = 'monthly', status = 'trialing', startsAt = new Date(), currentPeriodEnd = null, trialEndsAt = null } = req.body;
  if (!mongoose.isValidObjectId(academyId) || !mongoose.isValidObjectId(planId)) return res.status(400).json({ success: false, message: 'Valid academyId and planId are required.' });
  if (!['monthly', 'annual'].includes(billingCycle) || !['trialing', 'active', 'past_due', 'cancelled', 'expired'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid billingCycle or status.' });
  const [academy, plan] = await Promise.all([Academy.findOne({ _id: academyId, isDeleted: false }), PlatformPlan.findOne({ _id: planId, isActive: true })]);
  if (!academy || !plan) return res.status(404).json({ success: false, message: 'Academy or active plan not found.' });
  const amount = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  const subscription = await AcademySubscription.create({ academyId, planId, billingCycle, status, amount, startsAt, currentPeriodEnd, trialEndsAt });
  // Keep legacy academy.plan populated for existing academy-facing UI; the subscription record is the source of truth.
  academy.plan = ['free', 'basic', 'premium'].includes(plan.code) ? plan.code : academy.plan;
  await academy.save();
  await audit(req, 'subscription.assigned', 'AcademySubscription', subscription._id, academy._id, '', { planId: String(plan._id), status, billingCycle, amount });
  res.status(201).json({ success: true, subscription });
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.academyId && mongoose.isValidObjectId(req.query.academyId)) filter.academyId = req.query.academyId;
  const [logs, total] = await Promise.all([PlatformAuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('actorId', 'fullName email'), PlatformAuditLog.countDocuments(filter)]);
  res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

module.exports = { getDashboard, listAcademies, setAcademyStatus, listPlans, createPlan, updatePlan, listSubscriptions, assignSubscription, getAuditLogs };
