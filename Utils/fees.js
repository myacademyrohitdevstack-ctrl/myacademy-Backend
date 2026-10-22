const mongoose = require("mongoose");
const FeeSequence = require("../Modals/FeeSequence");

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function money(value, field = "amount") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw httpError(400, `${field} must be a non-negative number.`);
  // Store currency in whole paise-equivalent? This app uses INR rupees as decimals.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function nextReceiptNumber(academyId, session) {
  const row = await FeeSequence.findOneAndUpdate(
    { academyId, key: "receipt" },
    { $inc: { value: 1 }, $setOnInsert: { academyId, key: "receipt" } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );
  const year = new Date().getFullYear();
  return `REC-${year}-${String(row.value).padStart(6, "0")}`;
}

function recalculateFee(fee) {
  const paid = Math.round((fee.installments || []).reduce((sum, item) => sum + Number(item.paidAmount || 0), 0) * 100) / 100;
  fee.paidAmount = Math.min(paid, fee.totalPayable);
  fee.balanceAmount = Math.max(0, Math.round((fee.totalPayable - fee.paidAmount) * 100) / 100);
  fee.status = fee.balanceAmount <= 0 ? "paid" : fee.paidAmount > 0 ? "partial" : "pending";
  if (fee.balanceAmount > 0 && (fee.installments || []).some(i => i.status !== "paid" && i.status !== "waived" && new Date(i.dueDate) < new Date())) {
    fee.status = "overdue";
  }
}

module.exports = { httpError, isObjectId, money, nextReceiptNumber, recalculateFee };
