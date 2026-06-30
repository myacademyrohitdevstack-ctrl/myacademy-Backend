const asyncHandler = require("../Utils/asyncHandler");
const Attendance = require("../Modals/Attendence");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
/**
 * @desc    Mark attendance
 * @route   POST /api/attendance
 * @access  Teacher/Admin
 */
const markAttendance = asyncHandler(async (req, res) => {
  const { batch,  date, records } = req.body;
console.log(req.academy._id)
  const batchDoc=await Batch.findOne({
    _id:batch,
    academyId:req.academy._id,
      isDeleted:false
  })
  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch Not found",
    });
  }
  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  const alreadyExists = await Attendance.findOne({
    batch,
    date: attendanceDate,
    academyId:req.academy._id,
      isDeleted:false
  });

  if (alreadyExists) {
    return res.status(400).json({
      success: false,
      message: "Attendance has already been marked for this batch on this date.",
    });
  }
  const studentIds = records.map(r => r.student);

const validStudents = await User.find({
  _id: { $in: studentIds },
  academyId: req.academy._id,
    isDeleted:false
});
const validStudentIds = validStudents.map(s => s._id.toString());

const invalidStudents = studentIds.filter(
  id => !validStudentIds.includes(id.toString())
);

if (invalidStudents.length > 0) {
  return res.status(400).json({
    success: false,
    message: "Some students do not belong to this academy",
  });
}
  console.log({
  batch,
  date: attendanceDate,
  records,
  markedBy: req.user._id,
  academyId: req.academy._id,
});
  const attendance = await Attendance.create({
    batch,
    date: attendanceDate,
    records,
    markedBy: req.user._id,
       academyId:req.academy._id
  });

  return res.status(201).json({
    success: true,
    message: "Attendance marked successfully.",
    attendance,
  });
});


const updateAttendance = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;
  const { records } = req.body;

  if (!records?.length) {
    return res.status(400).json({
      success: false,
      message: "Attendance records are required.",
    });
  }

  const attendance = await Attendance.findOne({
    _id:attendanceId,
       academyId:req.academy._id,
         isDeleted:false
  });

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  attendance.records = records;
  attendance.markedBy = req.user._id;

  await attendance.save();

  return res.status(200).json({
    success: true,
    message: "Attendance updated successfully.",
    attendance,
  });
});

/**
 * @desc    Get attendance by batch and date
 * @route   GET /api/attendance?batch=&date=
 * @access  Teacher/Admin
 */
const getAttendance = asyncHandler(async (req, res) => {
  const { batch, date } = req.query;

  if (!batch || !date) {
    return res.status(400).json({
      success: false,
      message: "Batch and date are required.",
    });
  }
   const batchDoc=await Batch.findOne({
    _id:batch,
    academyId:req.academy._id,
      isDeleted:false
  })
  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch Not found",
    });
  }

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  const attendance = await Attendance.findOne({
    batch,
    date: attendanceDate,
       academyId:req.academy._id,
         isDeleted:false
  })
    .populate("batch", "batchName")
    .populate("records.student", "fullName email profileImage")
    .populate("markedBy", "fullName email");

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  return res.status(200).json({
    success: true,
    attendance,
  });
});

/**
 * @desc    Get attendance history of a batch
 * @route   GET /api/attendance/batch/:batchId
 * @access  Teacher/Admin
 */
const getBatchAttendanceHistory = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
 const batchDoc=await Batch.findOne({
    _id:batchId,
    academyId:req.academy._id,
      isDeleted:false
  })
  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch Not found",
    });
  }
  const attendance = await Attendance.find({
       academyId:req.academy._id,
    batch: batchId,
      isDeleted:false
  })
    .populate("markedBy", "fullName")
    .sort({ date: -1 });

  return res.status(200).json({
    success: true,
    total: attendance.length,
    attendance,
  });
});

/**
 * @desc    Get attendance report of a student
 * @route   GET /api/attendance/student/:studentId
 * @access  Teacher/Admin
 */
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
const studentExists = await User.findOne({
  _id: studentId,
  academyId: req.academy._id,
    isDeleted:false
});

  if (!studentExists) {
    return res.status(400).json({
      success: false,
      message: "Student  Not found",
    });
  }
  const attendance = await Attendance.find({
    "records.student": studentId,
       academyId:req.academy._id,
         isDeleted:false
  })
    .populate("batch", "batchName")
    .sort({ date: -1 });

  const report = attendance.map((item) => {
    const studentRecord = item.records.find(
      (record) => record.student.toString() === studentId
    );

    return {
      attendanceId: item._id,
      batch: item.batch,
      date: item.date,
      status: studentRecord?.status || null,
    };
  });

  const totalClasses = report.length;
  const present = report.filter(
    (item) => item.status === "present"
  ).length;
  const absent = report.filter(
    (item) => item.status === "absent"
  ).length;

  return res.status(200).json({
    success: true,
    summary: {
      totalClasses,
      present,
      absent,
      attendancePercentage:
        totalClasses === 0
          ? 0
          : Number(((present / totalClasses) * 100).toFixed(2)),
    },
    report,
  });
});

/**
 * @desc    Delete attendance
 * @route   DELETE /api/attendance/:attendanceId
 * @access  Admin
 */
const deleteAttendance = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;

  const attendance = await Attendance.findOneAndUpdate(
    {
      _id: attendanceId,
      academyId: req.academy._id,
      isDeleted: false,
    },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Attendance deleted successfully.",
  });
});

const getAttendanceDashboard = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
 const batchDoc=await Batch.findOne({
    _id:batchId,
    academyId:req.academy._id,
      isDeleted:false
  })
  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch Not found",
    });
  }
  const attendance = await Attendance.find({
       academyId:req.academy._id,
    batch: batchId,
      isDeleted:false
  })
    .populate("markedBy", "fullName")
    .sort({ date: -1 });

  let totalClasses = attendance.length;
  let totalPresent = 0;
  let totalAbsent = 0;

  let attendanceHistory = [];
  let recentAbsentees = [];

  attendance.forEach((item) => {
    const presentCount = item.records.filter(
      (record) => record.status === "present"
    ).length;

    const absentCount = item.records.filter(
      (record) => record.status === "absent"
    ).length;

    const percentage =
      item.records.length === 0
        ? 0
        : Math.round((presentCount / item.records.length) * 100);

    totalPresent += presentCount;
    totalAbsent += absentCount;

    attendanceHistory.push({
      _id: item._id,
      date: item.date,
      presentCount,
      absentCount,
      percentage,
      markedBy: item.markedBy,
    });

    item.records.forEach((record) => {
      if (record.status === "absent") {
        recentAbsentees.push({
          student: record.student,
          date: item.date,
        });
      }
    });
  });

  recentAbsentees = recentAbsentees.slice(0, 5);

  const averageAttendance =
    totalClasses === 0
      ? 0
      : Math.round(
          (totalPresent / (totalPresent + totalAbsent)) * 100
        );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAttendance = attendance.find((item) => {
    const d = new Date(item.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  const todayPresent = todayAttendance
    ? todayAttendance.records.filter(
        (record) => record.status === "present"
      ).length
    : 0;

  const todayAbsent = todayAttendance
    ? todayAttendance.records.filter(
        (record) => record.status === "absent"
      ).length
    : 0;

  const highestAttendance =
    attendanceHistory.length > 0
      ? attendanceHistory.reduce((a, b) =>
          a.percentage > b.percentage ? a : b
        )
      : null;

  const lowestAttendance =
    attendanceHistory.length > 0
      ? attendanceHistory.reduce((a, b) =>
          a.percentage < b.percentage ? a : b
        )
      : null;

  return res.status(200).json({
    success: true,

    stats: {
      totalClasses,
      averageAttendance,
      todayPresent,
      todayAbsent,
    },

    insights: {
      highestAttendance,
      lowestAttendance,
      lastUpdated:
        attendance.length > 0 ? attendance[0].updatedAt : null,
    },

    attendanceHistory,

    recentAbsentees,
  });
});

const getAttendanceById = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;

  const attendance = await Attendance.findOne({
    _id: attendanceId,
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("batch", "name")
    .populate(
      "records.student",
      "fullName email phone profileImage"
    )
    .populate("markedBy", "fullName email");

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  const totalStudents = attendance.records.length;

  const present = attendance.records.filter(
    (record) => record.status === "present"
  ).length;

  const absent = attendance.records.filter(
    (record) => record.status === "absent"
  ).length;

  const percentage =
    totalStudents === 0
      ? 0
      : Number(((present / totalStudents) * 100).toFixed(2));

  return res.status(200).json({
    success: true,
    attendance: {
      _id: attendance._id,
      batch: attendance.batch,
      date: attendance.date,
      markedBy: attendance.markedBy,
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
      stats: {
        totalStudents,
        present,
        absent,
        percentage,
      },
      records: attendance.records,
    },
  });
});

module.exports = {
  getAttendanceDashboard,
  getAttendanceById,
  markAttendance,
  updateAttendance,
  getAttendance,
  getBatchAttendanceHistory,
  getStudentAttendance,
  deleteAttendance,
};