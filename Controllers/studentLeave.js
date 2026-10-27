const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const StudentLeave = require("../Modals/StudentLeave");
const Attendance = require("../Modals/Attendence");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const { normalizeDate, formatDateKey } = require("../Utils/dateUtils");

/**
 * @desc    Request student leave
 * @route   POST /api/student-leave
 * @access  Student
 */
const requestStudentLeave = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, batch } = req.body;

  if (!startDate || !endDate || !reason) {
    return res.status(400).json({
      success: false,
      message: "startDate, endDate, and reason are required.",
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

  // Prevent overlapping pending/approved requests
  const existing = await StudentLeave.findOne({
    academyId: req.academy._id,
    student: req.user._id,
    status: { $in: ["pending", "approved"] },
    isDeleted: false,
    startDate: { $lte: end },
    endDate: { $gte: start },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: `You already have a ${existing.status} leave request covering this period (${formatDateKey(
        existing.startDate
      )} to ${formatDateKey(existing.endDate)}).`,
    });
  }

  const leave = await StudentLeave.create({
    academyId: req.academy._id,
    student: req.user._id,
    batch: batch || null,
    startDate: start,
    endDate: end,
    reason: reason.trim(),
    status: "pending",
  });

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "APPROVE_STUDENT_LEAVE",
    targetType: "StudentLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      action: "SUBMIT_REQUEST",
      startDate: start,
      endDate: end,
      reason,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Leave request submitted successfully. Awaiting approval.",
    leave,
  });
});

/**
 * @desc    Get logged in student's leave requests
 * @route   GET /api/student-leave/my
 * @access  Student
 */
const getMyStudentLeaves = asyncHandler(async (req, res) => {
  const leaves = await StudentLeave.find({
    academyId: req.academy._id,
    student: req.user._id,
    isDeleted: false,
  })
    .populate("batch", "name")
    .populate("reviewedBy", "fullName email")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: leaves.length,
    leaves,
  });
});

/**
 * @desc    Get all student leave requests for academy
 * @route   GET /api/student-leave
 * @access  Admin / Teacher / Staff
 */
const getAcademyStudentLeaves = asyncHandler(async (req, res) => {
  const { status, batch, studentId } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (status) query.status = status;
  if (batch) query.batch = batch;
  if (studentId) query.student = studentId;

  const leaves = await StudentLeave.find(query)
    .populate("student", "fullName email phone profileImage")
    .populate("batch", "name")
    .populate("reviewedBy", "fullName email")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: leaves.length,
    leaves,
  });
});

/**
 * @desc    Review student leave request (Approve / Reject)
 * @route   PUT /api/student-leave/:id/review
 * @access  Admin / Teacher / Staff
 */
const reviewStudentLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reviewRemarks = "" } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be either 'approved' or 'rejected'.",
    });
  }

  const leave = await StudentLeave.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  }).populate("student", "fullName email");

  if (!leave) {
    return res.status(404).json({
      success: false,
      message: "Leave request not found.",
    });
  }

  // Student cannot approve own leave
  if (String(leave.student._id) === String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "Students cannot approve their own leave.",
    });
  }

  leave.status = status;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  leave.reviewRemarks = reviewRemarks.trim();
  await leave.save();

  // If approved: check if attendance was already recorded during this date range where student was marked absent
  // Safely correct their status to "leave" with audit log
  let correctedRecordsCount = 0;
  if (status === "approved") {
    const matchingAttendances = await Attendance.find({
      academyId: req.academy._id,
      date: { $gte: leave.startDate, $lte: leave.endDate },
      isDeleted: false,
      "records.student": leave.student._id,
    });

    for (const att of matchingAttendances) {
      let modified = false;
      att.records.forEach((rec) => {
        if (String(rec.student) === String(leave.student._id) && rec.status === "absent") {
          rec.status = "leave";
          rec.remarks = `Corrected to Leave following approved leave request (${leave.reason})`;
          modified = true;
          correctedRecordsCount++;

          att.auditHistory.push({
            modifiedBy: req.user._id,
            modifiedAt: new Date(),
            student: leave.student._id,
            previousStatus: "absent",
            newStatus: "leave",
            reason: `Late leave approval: ${reviewRemarks || leave.reason}`,
          });
        }
      });

      if (modified) {
        await att.save();
      }
    }
  }

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: status === "approved" ? "APPROVE_STUDENT_LEAVE" : "REJECT_STUDENT_LEAVE",
    targetType: "StudentLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      status,
      reviewRemarks,
      correctedRecordsCount,
    },
  });

  return res.status(200).json({
    success: true,
    message: `Student leave ${status} successfully.${
      correctedRecordsCount > 0
        ? ` Corrected ${correctedRecordsCount} previous absence record(s) to Approved Leave.`
        : ""
    }`,
    leave,
    correctedRecordsCount,
  });
});

/**
 * @desc    Cancel a pending student leave request
 * @route   PATCH /api/student-leave/:id/cancel
 * @access  Student / Admin
 */
const cancelStudentLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const leave = await StudentLeave.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!leave) {
    return res.status(404).json({
      success: false,
      message: "Leave request not found.",
    });
  }

  if (req.user.role === "student" && String(leave.student) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "You can only cancel your own leave requests.",
    });
  }

  if (leave.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Only pending leave requests can be cancelled.",
    });
  }

  leave.status = "cancelled";
  await leave.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "CANCEL_STUDENT_LEAVE",
    targetType: "StudentLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: { action: "CANCEL_LEAVE" },
  });

  return res.status(200).json({
    success: true,
    message: "Leave request cancelled successfully.",
    leave,
  });
});

module.exports = {
  requestStudentLeave,
  getMyStudentLeaves,
  getAcademyStudentLeaves,
  reviewStudentLeave,
  cancelStudentLeave,
};
