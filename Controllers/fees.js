const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");
const Student = require("../Modals/Student");
const Batch = require("../Modals/Batches");
const Course = require("../Modals/Courses");
const FeePlan = require("../Modals/FeePlan");
const StudentFee = require("../Modals/StudentFee");
const FeePayment = require("../Modals/FeePayment");
const { httpError, isObjectId, money, nextReceiptNumber, recalculateFee } = require("../Utils/fees");
const { assertFeatureEnabled } = require("../Utils/planEnforcer");

const academyIdOf = req => req.academy._id;
const activeFeeFilter = req => ({ academyId: academyIdOf(req), isDeleted: false });

function requireId(value, label) {
  if (!isObjectId(value)) throw httpError(400, `Invalid ${label}.`);
}

function buildInstallments({ total, count, startDate, frequency, template }) {
  const start = new Date(startDate || new Date());
  if (Number.isNaN(start.getTime())) throw httpError(400, "Invalid installment start date.");
  const safeCount = Number(count);
  if (!Number.isInteger(safeCount) || safeCount < 1 || safeCount > 60) throw httpError(400, "Installments must be between 1 and 60.");
  const freqMonths = frequency === "quarterly" ? 3 : frequency === "bi-monthly" ? 2 : frequency === "one-time" ? 0 : 1;
  let remainingCents = Math.round(total * 100);
  const rows = [];
  for (let i = 0; i < safeCount; i++) {
    const amount = i === safeCount - 1 ? remainingCents / 100 : Math.floor(remainingCents / (safeCount - i)) / 100;
    remainingCents -= Math.round(amount * 100);
    const dueDate = new Date(start);
    if (template && template[i] && template[i].dueDate) {
      const custom = new Date(template[i].dueDate);
      if (Number.isNaN(custom.getTime())) throw httpError(400, `Invalid due date for installment ${i + 1}.`);
      rows.push({ label: template[i].label || `Installment ${i + 1}`, amount, dueDate: custom, status: "pending" });
    } else {
      dueDate.setDate(dueDate.getDate() + Math.max(0, Number(template && template[i] && template[i].dueDateOffsetDays) || 0));
      if (!(template && template[i] && template[i].dueDateOffsetDays)) dueDate.setMonth(dueDate.getMonth() + (freqMonths * i));
      rows.push({ label: template && template[i] && template[i].label || (safeCount === 1 ? "Full payment" : `Installment ${i + 1}`), amount, dueDate, status: "pending" });
    }
  }
  if (rows.reduce((s, r) => s + r.amount, 0) !== total) {
    const sum = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    if (sum !== total) rows[rows.length - 1].amount = Math.round((rows[rows.length - 1].amount + total - sum) * 100) / 100;
  }
  return rows;
}

exports.listFeePlans = asyncHandler(async (req, res) => {
  const { status, search = "", page = 1, limit = 20 } = req.query;
  const filter = activeFeeFilter(req);
  if (status && ["active", "inactive", "archived"].includes(status)) filter.status = status;
  if (search.trim()) filter.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [plans, total] = await Promise.all([
    FeePlan.find(filter).populate("batch", "name").populate("course", "title").sort("-createdAt").skip((p - 1) * l).limit(l),
    FeePlan.countDocuments(filter),
  ]);
  const ids = plans.map(x => x._id);
  const assigned = await StudentFee.aggregate([
    { $match: { academyId: academyIdOf(req), isDeleted: false, feePlan: { $in: ids } } },
    { $group: { _id: "$feePlan", count: { $sum: 1 } } },
  ]);
  const counts = new Map(assigned.map(x => [String(x._id), x.count]));
  res.json({ success: true, data: plans.map(x => ({ ...x.toObject(), assignedStudents: counts.get(String(x._id)) || 0 })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
});

exports.createFeePlan = asyncHandler(async (req, res) => {
  await assertFeatureEnabled(academyIdOf(req), "fee_management");
  const { name, description = "", course = null, batch = null, totalAmount, frequency = "monthly", installments = 1, lateFeeAmount = 0, lateFeeGraceDays = 0, installmentTemplate = [] } = req.body;
  if (!name || !String(name).trim()) throw httpError(400, "Fee plan name is required.");
  const total = money(totalAmount, "totalAmount");
  if (!["one-time", "weekly", "monthly", "bi-monthly", "quarterly", "custom"].includes(frequency)) throw httpError(400, "Invalid frequency.");
  if (course) {
    requireId(course, "course id");
    if (!await Course.exists({ _id: course, academyId: academyIdOf(req), isDeleted: false })) throw httpError(404, "Course not found in this academy.");
  }
  if (batch) {
    requireId(batch, "batch id");
    if (!await Batch.exists({ _id: batch, academyId: academyIdOf(req), isDeleted: false })) throw httpError(404, "Batch not found in this academy.");
  }
  const plan = await FeePlan.create({
    academyId: academyIdOf(req), name: String(name).trim(), description, course, batch, totalAmount: total,
    frequency, installments: Number(installments), lateFeeAmount: money(lateFeeAmount, "lateFeeAmount"),
    lateFeeGraceDays: Math.max(0, Number(lateFeeGraceDays) || 0), installmentTemplate,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, message: "Fee plan created.", data: plan });
});

exports.updateFeePlan = asyncHandler(async (req, res) => {
  requireId(req.params.id, "fee plan id");
  const allowed = ["name", "description", "course", "batch", "totalAmount", "frequency", "installments", "lateFeeAmount", "lateFeeGraceDays", "installmentTemplate", "status"];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
  if (updates.totalAmount !== undefined) updates.totalAmount = money(updates.totalAmount, "totalAmount");
  if (updates.lateFeeAmount !== undefined) updates.lateFeeAmount = money(updates.lateFeeAmount, "lateFeeAmount");
  if (updates.status && !["active", "inactive", "archived"].includes(updates.status)) throw httpError(400, "Invalid fee plan status.");
  if (updates.name !== undefined && !String(updates.name).trim()) throw httpError(400, "Name cannot be empty.");
  updates.updatedBy = req.user._id;
  const plan = await FeePlan.findOneAndUpdate({ _id: req.params.id, ...activeFeeFilter(req) }, { $set: updates }, { new: true, runValidators: true });
  if (!plan) throw httpError(404, "Fee plan not found.");
  res.json({ success: true, message: "Fee plan updated.", data: plan });
});

exports.archiveFeePlan = asyncHandler(async (req, res) => {
  requireId(req.params.id, "fee plan id");
  const plan = await FeePlan.findOneAndUpdate({ _id: req.params.id, ...activeFeeFilter(req) }, { $set: { status: "archived" } }, { new: true });
  if (!plan) throw httpError(404, "Fee plan not found.");
  res.json({ success: true, message: "Fee plan archived.", data: plan });
});

exports.searchFeeStudents = asyncHandler(async (req, res) => {
  const { search = "", batchId = "", limit = 20 } = req.query;
  const query = { academyId: academyIdOf(req), role: "student", isDeleted: false, status: { $ne: "blocked" } };
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [{ fullName: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }, { phone: { $regex: escaped, $options: "i" } }];
  }
  let users = await User.find(query).select("fullName email phone").sort("fullName").limit(Math.min(100, Math.max(1, Number(limit) || 20))).lean();
  if (batchId) {
    requireId(batchId, "batch id");
    const batch = await Batch.findOne({ _id: batchId, academyId: academyIdOf(req), isDeleted: false }).select("students").lean();
    if (!batch) throw httpError(404, "Batch not found.");
    const allowed = new Set((batch.students || []).map(String));
    users = users.filter(u => allowed.has(String(u._id)));
  }
  const ids = users.map(u => u._id);
  const [profiles, fees] = await Promise.all([
    Student.find({ user: { $in: ids }, academyId: academyIdOf(req), isDeleted: false }).select("user").lean(),
    StudentFee.find({ student: { $in: ids }, academyId: academyIdOf(req), isDeleted: false, status: { $ne: "cancelled" } }).select("student totalPayable paidAmount balanceAmount status installments batch").populate("batch", "name").lean(),
  ]);
  const profileByUser = new Map(profiles.map(p => [String(p.user), p]));
  const feeByUser = new Map();
  for (const fee of fees) {
    const key = String(fee.student);
    const existing = feeByUser.get(key) || { totalFee: 0, paidAmount: 0, pendingAmount: 0, dueDate: null, feeAccounts: [] };
    existing.totalFee += fee.totalPayable;
    existing.paidAmount += fee.paidAmount;
    existing.pendingAmount += fee.balanceAmount;
    const nextDue = (fee.installments || []).filter(i => i.status !== "paid" && i.status !== "waived").sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))[0];
    if (nextDue && (!existing.dueDate || new Date(nextDue.dueDate) < new Date(existing.dueDate))) existing.dueDate = nextDue.dueDate;
    existing.feeAccounts.push({ _id: fee._id, batch: fee.batch, status: fee.status, balanceAmount: fee.balanceAmount });
    feeByUser.set(key, existing);
  }
  res.json({ success: true, data: users.map(u => ({ _id: u._id, userId: u._id, name: u.fullName, email: u.email, phone: u.phone, studentProfileId: profileByUser.get(String(u._id))?._id || null, ...(feeByUser.get(String(u._id)) || { totalFee: 0, paidAmount: 0, pendingAmount: 0, dueDate: null, feeAccounts: [] }) })) });
});

exports.assignFee = asyncHandler(async (req, res) => {
  const { studentId, feePlanId, batchId = null, discountAmount = 0, scholarshipAmount = 0, additionalCharges = 0, startDate = new Date(), notes = "" } = req.body;
  requireId(studentId, "student id");
  requireId(feePlanId, "fee plan id");
  const [student, plan] = await Promise.all([
    User.findOne({ _id: studentId, academyId: academyIdOf(req), role: "student", isDeleted: false }),
    FeePlan.findOne({ _id: feePlanId, ...activeFeeFilter(req), status: "active" }),
  ]);
  if (!student) throw httpError(404, "Student not found in this academy.");
  if (!plan) throw httpError(404, "Active fee plan not found.");
  let batch = null;
  const selectedBatch = batchId || plan.batch;
  if (selectedBatch) {
    requireId(selectedBatch, "batch id");
    batch = await Batch.findOne({ _id: selectedBatch, academyId: academyIdOf(req), isDeleted: false });
    if (!batch) throw httpError(404, "Batch not found.");
    if (!(batch.students || []).some(id => String(id) === String(studentId))) throw httpError(400, "Student is not enrolled in the selected batch.");
  }
  const base = money(plan.totalAmount, "plan total");
  const discount = money(discountAmount, "discountAmount");
  const scholarship = money(scholarshipAmount, "scholarshipAmount");
  const charges = money(additionalCharges, "additionalCharges");
  const payable = Math.max(0, Math.round((base - discount - scholarship + charges) * 100) / 100);
  if (discount + scholarship > base) throw httpError(400, "Discount and scholarship cannot exceed the base fee.");
  const profile = await Student.findOne({ user: studentId, academyId: academyIdOf(req), isDeleted: false }).select("_id");
  const totalInstallments = Number(plan.installments);
  const installments = buildInstallments({ total: payable, count: totalInstallments, startDate, frequency: plan.frequency, template: plan.installmentTemplate });
  const fee = await StudentFee.create({
    academyId: academyIdOf(req), student: studentId, studentProfile: profile?._id || null, batch: batch?._id || null,
    course: plan.course || batch?.course || null, feePlan: plan._id, feePlanNameSnapshot: plan.name,
    baseAmount: base, discountAmount: discount, scholarshipAmount: scholarship, additionalCharges: charges,
    totalPayable: payable, paidAmount: 0, balanceAmount: payable, installments, status: payable === 0 ? "paid" : "pending",
    assignedBy: req.user._id, notes,
  });
  res.status(201).json({ success: true, message: "Fee assigned to student.", data: fee });
});

exports.listStudentFees = asyncHandler(async (req, res) => {
  const filter = { ...activeFeeFilter(req) };
  if (req.query.studentId) { requireId(req.query.studentId, "student id"); filter.student = req.query.studentId; }
  if (req.query.batchId) { requireId(req.query.batchId, "batch id"); filter.batch = req.query.batchId; }
  if (req.query.status && ["pending", "partial", "paid", "overdue", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  const fees = await StudentFee.find(filter).populate("student", "fullName email phone").populate("batch", "name").populate("feePlan", "name frequency").sort("-createdAt").limit(Math.min(200, Math.max(1, Number(req.query.limit) || 100)));
  res.json({ success: true, count: fees.length, data: fees });
});

exports.getStudentFeeSummary = asyncHandler(async (req, res) => {
  requireId(req.params.studentId, "student id");
  const student = await User.findOne({ _id: req.params.studentId, academyId: academyIdOf(req), role: "student", isDeleted: false }).select("fullName email phone");
  if (!student) throw httpError(404, "Student not found.");
  const [fees, payments] = await Promise.all([
    StudentFee.find({ ...activeFeeFilter(req), student: student._id, status: { $ne: "cancelled" } }).populate("batch", "name").populate("feePlan", "name").sort("-createdAt"),
    FeePayment.find({ academyId: academyIdOf(req), student: student._id, status: "completed" }).sort("-paidAt").limit(50),
  ]);
  res.json({ success: true, data: { student, totals: fees.reduce((a,f) => ({ totalPayable: a.totalPayable + f.totalPayable, paidAmount: a.paidAmount + f.paidAmount, balanceAmount: a.balanceAmount + f.balanceAmount }), { totalPayable: 0, paidAmount: 0, balanceAmount: 0 }), fees, payments } });
});

exports.collectPayment = asyncHandler(async (req, res) => {
  await assertFeatureEnabled(academyIdOf(req), "fee_management");
  const { studentFeeId, amount, mode, referenceNumber = "", paidAt = new Date(), remarks = "", installmentId = null } = req.body;
  requireId(studentFeeId, "student fee id");
  const paymentAmount = money(amount, "amount");
  if (paymentAmount <= 0) throw httpError(400, "Payment amount must be greater than zero.");
  const modes = ["UPI", "Cash", "Card", "Net Banking", "Cheque", "Bank Transfer", "Other"];
  if (!modes.includes(mode)) throw httpError(400, "Unsupported payment mode.");
  const date = new Date(paidAt);
  if (Number.isNaN(date.getTime())) throw httpError(400, "Invalid payment date.");
  const session = await mongoose.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      const fee = await StudentFee.findOne({ _id: studentFeeId, ...activeFeeFilter(req) }).session(session);
      if (!fee) throw httpError(404, "Student fee account not found.");
      if (fee.status === "cancelled") throw httpError(400, "Cannot collect against a cancelled fee account.");
      if (paymentAmount > fee.balanceAmount) throw httpError(400, "Payment exceeds outstanding balance.");
      let targets;
      if (installmentId) {
        const target = fee.installments.id(installmentId);
        if (!target) throw httpError(404, "Installment not found.");
        if (["paid", "waived"].includes(target.status)) throw httpError(400, "Installment is already settled.");
        if (paymentAmount > target.amount - target.paidAmount) throw httpError(400, "Payment exceeds this installment's outstanding amount.");
        targets = [target];
      } else {
        targets = fee.installments.filter(i => !["paid", "waived"].includes(i.status) && i.paidAmount < i.amount).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
      }
      if (!targets.length) throw httpError(400, "No payable installment remains.");
      let remaining = paymentAmount;
      const allocations = [];
      for (const target of targets) {
        if (remaining <= 0) break;
        const due = Math.round((target.amount - target.paidAmount) * 100) / 100;
        const applied = Math.min(due, remaining);
        if (applied <= 0) continue;
        target.paidAmount = Math.round((target.paidAmount + applied) * 100) / 100;
        target.status = target.paidAmount >= target.amount ? "paid" : "partial";
        allocations.push({ installmentId: target._id, label: target.label, amount: applied });
        remaining = Math.round((remaining - applied) * 100) / 100;
      }
      if (remaining > 0) throw httpError(400, "Payment exceeds outstanding installment balances.");
      recalculateFee(fee);
      await fee.save({ session });
      const receiptNo = await nextReceiptNumber(academyIdOf(req), session);
      [payment] = await FeePayment.create([{
        academyId: academyIdOf(req), studentFee: fee._id, student: fee.student, batch: fee.batch,
        receiptNo, amount: paymentAmount, allocations, mode, referenceNumber: String(referenceNumber).trim(),
        paidAt: date, remarks: String(remarks).trim(), collectedBy: req.user._id, status: "completed",
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  const result = await FeePayment.findById(payment._id).populate("student", "fullName email phone").populate("batch", "name").populate("collectedBy", "fullName");
  res.status(201).json({ success: true, message: "Payment recorded successfully.", data: result });
});

exports.listPayments = asyncHandler(async (req, res) => {
  const filter = { academyId: academyIdOf(req) };
  if (req.query.status && ["completed", "reversed"].includes(req.query.status)) filter.status = req.query.status;
  else filter.status = "completed";
  if (req.query.studentId) { requireId(req.query.studentId, "student id"); filter.student = req.query.studentId; }
  if (req.query.batchId) { requireId(req.query.batchId, "batch id"); filter.batch = req.query.batchId; }
  if (req.query.mode && ["UPI", "Cash", "Card", "Net Banking", "Cheque", "Bank Transfer", "Other"].includes(req.query.mode)) filter.mode = req.query.mode;
  if (req.query.from || req.query.to) {
    filter.paidAt = {};
    if (req.query.from) filter.paidAt.$gte = new Date(req.query.from);
    if (req.query.to) { const to = new Date(req.query.to); to.setHours(23,59,59,999); filter.paidAt.$lte = to; }
  }
  if (req.query.search) {
    const escaped = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ receiptNo: { $regex: escaped, $options: "i" } }, { referenceNumber: { $regex: escaped, $options: "i" } }, { remarks: { $regex: escaped, $options: "i" } }];
  }
  const p = Math.max(1, Number(req.query.page) || 1), l = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [data, total] = await Promise.all([
    FeePayment.find(filter).populate("student", "fullName email phone").populate("batch", "name").populate("collectedBy", "fullName").sort("-paidAt").skip((p-1)*l).limit(l),
    FeePayment.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page: p, limit: l, total, pages: Math.ceil(total/l) } });
});

exports.getReceipt = asyncHandler(async (req, res) => {
  const payment = await FeePayment.findOne({ _id: req.params.id, academyId: academyIdOf(req) })
    .populate("student", "fullName email phone").populate("batch", "name").populate("studentFee").populate("collectedBy", "fullName");
  if (!payment) throw httpError(404, "Receipt not found.");
  res.json({ success: true, data: payment });
});

exports.getPendingFees = asyncHandler(async (req, res) => {
  const filter = { ...activeFeeFilter(req), balanceAmount: { $gt: 0 }, status: { $in: ["pending", "partial", "overdue"] } };
  if (req.query.batchId) { requireId(req.query.batchId, "batch id"); filter.batch = req.query.batchId; }
  const fees = await StudentFee.find(filter).populate("student", "fullName email phone").populate("batch", "name").sort({ "installments.dueDate": 1 }).limit(Math.min(500, Math.max(1, Number(req.query.limit) || 100)));
  const now = new Date();
  const data = fees.map(f => {
    const obj = f.toObject();
    const nextDue = (f.installments || []).filter(i => !["paid", "waived"].includes(i.status)).sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))[0];
    const overdue = (f.installments || []).some(i => !["paid", "waived"].includes(i.status) && new Date(i.dueDate) < now);
    return { ...obj, nextDueDate: nextDue?.dueDate || null, urgency: overdue ? "critical" : nextDue && (new Date(nextDue.dueDate)-now) < 7*86400000 ? "upcoming" : "moderate" };
  });
  res.json({ success: true, count: data.length, data });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
  const [feeAgg, paymentAgg, todayAgg, students, plans, modes, monthly, batches] = await Promise.all([
    StudentFee.aggregate([{ $match: { academyId, isDeleted: false, status: { $ne: "cancelled" } } }, { $group: { _id: null, grossBilled: { $sum: "$totalPayable" }, outstanding: { $sum: "$balanceAmount" }, feeAccounts: { $sum: 1 } } }]),
    FeePayment.aggregate([{ $match: { academyId, status: "completed" } }, { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } }]),
    FeePayment.aggregate([{ $match: { academyId, status: "completed", paidAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } }, { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } }]),
    User.countDocuments({ academyId, role: "student", status: "active", isDeleted: false }),
    FeePlan.countDocuments({ academyId, isDeleted: false, status: "active" }),
    FeePayment.aggregate([{ $match: { academyId, status: "completed" } }, { $group: { _id: "$mode", amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
    FeePayment.aggregate([{ $match: { academyId, status: "completed", paidAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth()-5, 1) } } }, { $group: { _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { "_id.year": 1, "_id.month": 1 } }]),
    StudentFee.aggregate([{ $match: { academyId, isDeleted: false, status: { $ne: "cancelled" } } }, { $group: { _id: "$batch", billed: { $sum: "$totalPayable" }, collected: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" }, students: { $addToSet: "$student" } } }, { $sort: { billed: -1 } }]),
  ]);
  const collectedAllTime = paymentAgg[0]?.collected || 0;
  const billed = feeAgg[0]?.grossBilled || 0;
  const outstanding = feeAgg[0]?.outstanding || 0;
  res.json({ success: true, data: {
    grossBilled: billed, totalCollected: collectedAllTime, totalOutstanding: outstanding,
    realizationRate: billed > 0 ? Math.round((collectedAllTime / billed) * 1000) / 10 : 0,
    activeStudents: students, activeFeePlans: plans, feeAccounts: feeAgg[0]?.feeAccounts || 0,
    today: { amount: todayAgg[0]?.amount || 0, count: todayAgg[0]?.count || 0 },
    paymentModes: modes, monthlyCollections: monthly.map(x => ({ year: x._id.year, month: x._id.month, amount: x.amount, count: x.count })),
    batchLedger: await Promise.all(batches.map(async b => {
      const batch = b._id ? await Batch.findOne({ _id: b._id, academyId }).select("name").lean() : null;
      return { batchId: b._id, batchName: batch?.name || "Unassigned", billed: b.billed, collected: b.collected, outstanding: b.outstanding, studentCount: b.students.length };
    })),
  } });
});

exports.getReports = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw httpError(400, "Invalid report date range.");
  const [collections, outstanding, methods, batchLedger] = await Promise.all([
    FeePayment.aggregate([{ $match: { academyId, status: "completed", paidAt: { $gte: from, $lte: to } } }, { $group: { _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { "_id.year": 1, "_id.month": 1 } }]),
    StudentFee.aggregate([{ $match: { academyId, isDeleted: false, status: { $ne: "cancelled" }, balanceAmount: { $gt: 0 } } }, { $group: { _id: null, billed: { $sum: "$totalPayable" }, collected: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" }, accounts: { $sum: 1 } } }]),
    FeePayment.aggregate([{ $match: { academyId, status: "completed", paidAt: { $gte: from, $lte: to } } }, { $group: { _id: "$mode", amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
    StudentFee.aggregate([{ $match: { academyId, isDeleted: false, status: { $ne: "cancelled" } } }, { $group: { _id: "$batch", billed: { $sum: "$totalPayable" }, collected: { $sum: "$paidAmount" }, outstanding: { $sum: "$balanceAmount" }, students: { $addToSet: "$student" } } }]),
  ]);
  const ledger = await Promise.all(batchLedger.map(async b => {
    const batch = b._id ? await Batch.findOne({ _id: b._id, academyId }).select("name").lean() : null;
    return { batchId: b._id, batchName: batch?.name || "Unassigned", billed: b.billed, collected: b.collected, outstanding: b.outstanding, studentCount: b.students.length };
  }));
  res.json({ success: true, data: { from, to, collections, outstanding: outstanding[0] || { billed: 0, collected: 0, outstanding: 0, accounts: 0 }, paymentModes: methods, batchLedger: ledger } });
});

exports.reversePayment = asyncHandler(async (req, res) => {
  // Accounting-safe reversal: never delete a receipt; retain an audit record.
  requireId(req.params.id, "payment id");
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 5) throw httpError(400, "A reversal reason of at least 5 characters is required.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const payment = await FeePayment.findOne({ _id: req.params.id, academyId: academyIdOf(req), status: "completed" }).session(session);
      if (!payment) throw httpError(404, "Completed payment not found.");
      const fee = await StudentFee.findOne({ _id: payment.studentFee, academyId: academyIdOf(req), isDeleted: false }).session(session);
      if (!fee) throw httpError(409, "Related fee account not found; manual audit is required.");
      // Undo the exact installment allocations stored on the original receipt.
      let remaining = payment.amount;
      if (payment.allocations && payment.allocations.length) {
        for (const allocation of payment.allocations) {
          const inst = fee.installments.id(allocation.installmentId);
          if (!inst || inst.paidAmount < allocation.amount) throw httpError(409, "Could not reconcile this reversal with installment balances.");
          inst.paidAmount = Math.round((inst.paidAmount - allocation.amount) * 100) / 100;
          inst.status = inst.paidAmount <= 0 ? "pending" : inst.paidAmount >= inst.amount ? "paid" : "partial";
          remaining = Math.round((remaining - allocation.amount) * 100) / 100;
        }
      } else {
        // Compatibility for any legacy payment without allocation details.
        for (const inst of [...fee.installments].reverse()) {
          const canUndo = Math.min(inst.paidAmount, remaining);
          if (canUndo > 0) {
            inst.paidAmount = Math.round((inst.paidAmount - canUndo) * 100) / 100;
            inst.status = inst.paidAmount <= 0 ? "pending" : inst.paidAmount >= inst.amount ? "paid" : "partial";
            remaining = Math.round((remaining - canUndo) * 100) / 100;
          }
          if (remaining <= 0) break;
        }
      }
      if (remaining > 0) throw httpError(409, "Could not reconcile this reversal with installment balances.");
      recalculateFee(fee);
      await fee.save({ session });
      payment.status = "reversed"; payment.reversedAt = new Date(); payment.reversedBy = req.user._id; payment.reversalReason = reason;
      await payment.save({ session });
    });
  } finally { await session.endSession(); }
  res.json({ success: true, message: "Payment reversed and audit trail retained." });
});

exports.listAcademyBatches = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    academyId: academyIdOf(req),
    isDeleted: false,
  })
    .populate("course", "title")
    .select("_id name course maxStudents status")
    .sort("name");
  res.json({ success: true, count: batches.length, data: batches });
});

