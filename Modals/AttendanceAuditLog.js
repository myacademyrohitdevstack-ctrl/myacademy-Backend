const mongoose = require("mongoose");

const attendanceAuditLogSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      enum: [
        "MARK_ATTENDANCE",
        "UPDATE_ATTENDANCE",
        "DELETE_ATTENDANCE",
        "CANCEL_SESSION",
        "RESCHEDULE_SESSION",
        "SUBSTITUTE_TEACHER",
        "APPROVE_TEACHER_LEAVE",
        "REJECT_TEACHER_LEAVE",
        "CANCEL_TEACHER_LEAVE",
        "APPROVE_STUDENT_LEAVE",
        "REJECT_STUDENT_LEAVE",
        "CANCEL_STUDENT_LEAVE",
        "CORRECT_ATTENDANCE_LEAVE",
        "CREATE_TIMETABLE",
        "UPDATE_TIMETABLE",
        "CREATE_HOLIDAY",
        "DELETE_HOLIDAY",
        "EXTRA_SESSION_CREATED",
      ],
      index: true,
    },

    targetType: {
      type: String,
      enum: [
        "Attendance",
        "ClassSession",
        "TeacherLeave",
        "StudentLeave",
        "Holiday",
        "Timetable",
      ],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actorRole: {
      type: String,
      default: "",
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

attendanceAuditLogSchema.index({ academyId: 1, action: 1, createdAt: -1 });

module.exports =
  mongoose.models.AttendanceAuditLog ||
  mongoose.model("AttendanceAuditLog", attendanceAuditLogSchema);
