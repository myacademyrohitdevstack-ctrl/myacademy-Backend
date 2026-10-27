const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const Holiday = require("../Modals/Holiday");
const ClassSession = require("../Modals/ClassSession");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const { normalizeDate, formatDateKey } = require("../Utils/dateUtils");

/**
 * @desc    Create an academy or batch holiday
 * @route   POST /api/holidays
 * @access  Admin / Authorized Staff
 */
const createHoliday = asyncHandler(async (req, res) => {
  const { title, startDate, endDate, scope = "academy", batch = null, description = "" } = req.body;

  if (!title || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "title, startDate, and endDate are required.",
    });
  }

  if (scope === "batch" && !batch) {
    return res.status(400).json({
      success: false,
      message: "Batch ID is required when holiday scope is 'batch'.",
    });
  }

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  if (start > end) {
    return res.status(400).json({
      success: false,
      message: "startDate cannot be after endDate.",
    });
  }

  const holiday = await Holiday.create({
    academyId: req.academy._id,
    title: title.trim(),
    startDate: start,
    endDate: end,
    scope,
    batch: scope === "batch" ? batch : null,
    description: description.trim(),
    createdBy: req.user._id,
  });

  // Identify and cancel all affected future sessions falling in this holiday period
  const sessionQuery = {
    academyId: req.academy._id,
    date: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "rescheduled"] },
    attendanceMarked: false,
    isDeleted: false,
  };

  if (scope === "batch") {
    sessionQuery.batch = batch;
  }

  const cancelResult = await ClassSession.updateMany(sessionQuery, {
    $set: {
      status: "cancelled",
      cancellationReason: `Holiday: ${title.trim()}`,
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      makeUpRequired: false,
    },
  });

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "CREATE_HOLIDAY",
    targetType: "Holiday",
    targetId: holiday._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      title,
      startDate: start,
      endDate: end,
      scope,
      cancelledSessionsCount: cancelResult.modifiedCount,
    },
  });

  return res.status(201).json({
    success: true,
    message: `Holiday created successfully. Cancelled ${cancelResult.modifiedCount} scheduled class(es). Students are not marked absent.`,
    holiday,
    cancelledSessionsCount: cancelResult.modifiedCount,
  });
});

/**
 * @desc    Get holidays for an academy
 * @route   GET /api/holidays
 * @access  Admin / Teacher / Student / Staff
 */
const getHolidays = asyncHandler(async (req, res) => {
  const { scope, batch, year } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (scope) query.scope = scope;
  if (batch) query.batch = batch;

  if (year) {
    const y = parseInt(year, 10);
    const yStart = new Date(Date.UTC(y, 0, 1));
    const yEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
    query.startDate = { $lte: yEnd };
    query.endDate = { $gte: yStart };
  }

  const holidays = await Holiday.find(query)
    .populate("batch", "name")
    .populate("createdBy", "fullName")
    .sort({ startDate: -1 });

  return res.status(200).json({
    success: true,
    count: holidays.length,
    holidays,
  });
});

/**
 * @desc    Preview sessions affected by a proposed holiday
 * @route   GET /api/holidays/preview-affected
 * @access  Admin / Staff
 */
const previewAffectedSessions = asyncHandler(async (req, res) => {
  const { startDate, endDate, scope = "academy", batch = null } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate and endDate are required.",
    });
  }

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  const query = {
    academyId: req.academy._id,
    date: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
  };

  if (scope === "batch" && batch) {
    query.batch = batch;
  }

  const affectedSessions = await ClassSession.find(query)
    .populate("batch", "name")
    .populate("teacher", "fullName email")
    .sort({ date: 1, startTime: 1 });

  return res.status(200).json({
    success: true,
    count: affectedSessions.length,
    affectedSessions,
  });
});

/**
 * @desc    Delete a holiday (soft-delete)
 * @route   DELETE /api/holidays/:id
 * @access  Admin / Authorized Staff
 */
const deleteHoliday = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const holiday = await Holiday.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: "Holiday not found.",
    });
  }

  holiday.isDeleted = true;
  holiday.deletedAt = new Date();
  holiday.deletedBy = req.user._id;
  await holiday.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "DELETE_HOLIDAY",
    targetType: "Holiday",
    targetId: holiday._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: { title: holiday.title },
  });

  return res.status(200).json({
    success: true,
    message: "Holiday deleted successfully.",
  });
});

module.exports = {
  createHoliday,
  getHolidays,
  previewAffectedSessions,
  deleteHoliday,
};
