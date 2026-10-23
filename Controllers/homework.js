const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const { assertFeatureEnabled } = require("../Utils/planEnforcer");
const Homework = require("../Modals/Homework");
const HomeworkSubmission = require("../Modals/HomeworkSubmission");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
const ParentStudent = require("../Modals/ParentStudent");

// 1. Create Homework Assignment (Admin or Teacher)
const createHomework = asyncHandler(async (req, res) => {
  const { batchId, title, subject = "", description, dueDate, totalPoints = 100, attachments = [] } = req.body;

  if (!batchId || !title || !description || !dueDate) {
    return res.status(400).json({ success: false, message: "Batch, title, description, and due date are required." });
  }

  await assertFeatureEnabled(req.academy._id, "homework");

  const batch = await Batch.findOne({ _id: batchId, academyId: req.academy._id, isDeleted: false });
  if (!batch) {
    return res.status(404).json({ success: false, message: "Batch not found." });
  }

  if (req.user.role === "teacher" && !batch.trainers.some(t => t.toString() === req.user._id.toString())) {
    return res.status(403).json({ success: false, message: "You are not authorized to assign homework for this batch." });
  }

  const homework = await Homework.create({
    academyId: req.academy._id,
    batchId: batch._id,
    courseId: batch.course || null,
    title: title.trim(),
    subject: subject?.trim() || "",
    description: description.trim(),
    dueDate: new Date(dueDate),
    totalPoints: Number(totalPoints) || 100,
    attachments: Array.isArray(attachments) ? attachments : [],
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, message: "Homework assignment created successfully.", homework });
});

// 2. Get Homework List (Admin or Teacher)
const getHomeworkList = asyncHandler(async (req, res) => {
  const { batchId, status } = req.query;
  const filter = { academyId: req.academy._id, isDeleted: false };

  if (batchId) filter.batchId = batchId;
  if (status) filter.status = status;

  if (req.user.role === "teacher") {
    const teacherBatches = await Batch.find({
      academyId: req.academy._id,
      trainers: req.user._id,
      isDeleted: false,
    }).select("_id");
    const batchIds = teacherBatches.map(b => b._id);
    filter.batchId = batchId ? batchId : { $in: batchIds };
  }

  const assignments = await Homework.find(filter)
    .populate("batchId", "name students")
    .populate("courseId", "title")
    .sort({ dueDate: -1 });

  // Get submission counts for each homework
  const hwIds = assignments.map(h => h._id);
  const submissionCounts = await HomeworkSubmission.aggregate([
    { $match: { homeworkId: { $in: hwIds } } },
    { $group: { _id: "$homeworkId", totalSubmissions: { $sum: 1 }, gradedCount: { $sum: { $cond: [{ $eq: ["$status", "graded"] }, 1, 0] } } } }
  ]);
  const countsMap = new Map(submissionCounts.map(s => [String(s._id), s]));

  const enriched = assignments.map(h => {
    const counts = countsMap.get(String(h._id));
    const totalStudents = h.batchId?.students?.length || 0;
    return {
      ...h.toObject(),
      totalStudents,
      submittedCount: counts?.totalSubmissions || 0,
      gradedCount: counts?.gradedCount || 0,
      pendingReviewCount: (counts?.totalSubmissions || 0) - (counts?.gradedCount || 0),
    };
  });

  res.status(200).json({ success: true, count: enriched.length, assignments: enriched });
});

// 3. Get Single Homework with Student Submissions
const getHomeworkById = asyncHandler(async (req, res) => {
  const homework = await Homework.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false })
    .populate("batchId", "name students")
    .populate("courseId", "title")
    .populate("createdBy", "fullName email");

  if (!homework) {
    return res.status(404).json({ success: false, message: "Homework not found." });
  }

  // Load batch students
  const studentIds = homework.batchId?.students || [];
  const students = await User.find({ _id: { $in: studentIds }, isDeleted: false })
    .select("fullName email phone profileImage");

  // Load submissions
  const submissions = await HomeworkSubmission.find({ homeworkId: homework._id, academyId: req.academy._id })
    .populate("studentId", "fullName email phone profileImage")
    .populate("gradedBy", "fullName email");

  res.status(200).json({ success: true, homework, students, submissions });
});

// 4. Update Homework
const updateHomework = asyncHandler(async (req, res) => {
  const { title, subject, description, dueDate, totalPoints, status, attachments } = req.body;
  const homework = await Homework.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });

  if (!homework) {
    return res.status(404).json({ success: false, message: "Homework not found." });
  }

  if (title) homework.title = title.trim();
  if (subject !== undefined) homework.subject = subject.trim();
  if (description) homework.description = description.trim();
  if (dueDate) homework.dueDate = new Date(dueDate);
  if (totalPoints) homework.totalPoints = Number(totalPoints);
  if (status) homework.status = status;
  if (attachments && Array.isArray(attachments)) homework.attachments = attachments;

  await homework.save();
  res.status(200).json({ success: true, message: "Homework updated successfully.", homework });
});

// 5. Delete Homework
const deleteHomework = asyncHandler(async (req, res) => {
  const homework = await Homework.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });
  if (!homework) {
    return res.status(404).json({ success: false, message: "Homework not found." });
  }

  homework.isDeleted = true;
  await homework.save();
  await HomeworkSubmission.deleteMany({ homeworkId: homework._id });

  res.status(200).json({ success: true, message: "Homework and submissions deleted successfully." });
});

// 6. Submit Homework (Student)
const submitHomework = asyncHandler(async (req, res) => {
  const { content = "", attachments = [] } = req.body;
  const homework = await Homework.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });

  if (!homework) {
    return res.status(404).json({ success: false, message: "Homework not found." });
  }

  // Check if student belongs to this batch
  const batch = await Batch.findOne({ _id: homework.batchId, students: req.user._id, isDeleted: false });
  if (!batch) {
    return res.status(403).json({ success: false, message: "You are not enrolled in the batch for this homework." });
  }

  const now = new Date();
  const isLate = now > new Date(homework.dueDate);

  const submission = await HomeworkSubmission.findOneAndUpdate(
    { academyId: req.academy._id, homeworkId: homework._id, studentId: req.user._id },
    {
      $set: {
        batchId: homework.batchId,
        content: content.trim(),
        attachments: Array.isArray(attachments) ? attachments : [],
        submittedAt: now,
        status: isLate ? "late" : "submitted",
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: isLate ? "Homework submitted (Late submission)." : "Homework submitted successfully.",
    submission,
  });
});

// 7. Grade Homework Submission (Admin or Teacher)
const gradeSubmission = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { pointsAwarded, grade = "", feedback = "" } = req.body;

  const submission = await HomeworkSubmission.findOne({ _id: submissionId, academyId: req.academy._id })
    .populate("homeworkId", "title totalPoints");

  if (!submission) {
    return res.status(404).json({ success: false, message: "Submission not found." });
  }

  submission.pointsAwarded = Number(pointsAwarded) || 0;
  submission.grade = grade?.trim() || "";
  submission.feedback = feedback?.trim() || "";
  submission.status = "graded";
  submission.gradedBy = req.user._id;
  submission.gradedAt = new Date();

  await submission.save();

  res.status(200).json({ success: true, message: "Submission graded successfully.", submission });
});

// 8. Student: Get My Homework with Status
const getMyHomework = asyncHandler(async (req, res) => {
  // Find all batches where student is enrolled
  const enrolledBatches = await Batch.find({
    academyId: req.academy._id,
    students: req.user._id,
    isDeleted: false,
  }).select("_id name");

  const batchIds = enrolledBatches.map(b => b._id);

  // Find all active homework for these batches
  const homeworkList = await Homework.find({
    academyId: req.academy._id,
    batchId: { $in: batchIds },
    isDeleted: false,
  })
    .populate("batchId", "name")
    .populate("courseId", "title")
    .populate("createdBy", "fullName")
    .sort({ dueDate: -1 });

  // Load student submissions
  const hwIds = homeworkList.map(h => h._id);
  const submissions = await HomeworkSubmission.find({
    academyId: req.academy._id,
    homeworkId: { $in: hwIds },
    studentId: req.user._id,
  }).populate("gradedBy", "fullName");

  const subMap = new Map(submissions.map(s => [String(s.homeworkId), s]));
  const now = new Date();

  const enriched = homeworkList.map(h => {
    const sub = subMap.get(String(h._id));
    const isPastDue = now > new Date(h.dueDate);
    let computedStatus = "pending";
    if (sub) {
      computedStatus = sub.status; // "submitted", "graded", "late"
    } else if (isPastDue) {
      computedStatus = "overdue";
    }

    return {
      ...h.toObject(),
      submission: sub || null,
      submissionStatus: computedStatus,
      isPastDue,
    };
  });

  const totalAssigned = enriched.length;
  const completed = enriched.filter(e => e.submission).length;
  const pending = enriched.filter(e => !e.submission && !e.isPastDue).length;
  const overdue = enriched.filter(e => !e.submission && e.isPastDue).length;

  res.status(200).json({
    success: true,
    summary: { totalAssigned, completed, pending, overdue },
    homework: enriched,
  });
});

// 9. Parent: Get Linked Child Homework
const getChildHomework = asyncHandler(async (req, res) => {
  const { studentUserId } = req.params;

  // Verify parent link
  const link = await ParentStudent.findOne({
    academyId: req.academy._id,
    parentId: req.user._id,
    studentUserId,
    status: "active",
  });

  if (!link) {
    return res.status(403).json({ success: false, message: "Access denied. Student is not linked to your parent account." });
  }

  const enrolledBatches = await Batch.find({
    academyId: req.academy._id,
    students: studentUserId,
    isDeleted: false,
  }).select("_id name");

  const batchIds = enrolledBatches.map(b => b._id);

  const homeworkList = await Homework.find({
    academyId: req.academy._id,
    batchId: { $in: batchIds },
    isDeleted: false,
  })
    .populate("batchId", "name")
    .populate("courseId", "title")
    .populate("createdBy", "fullName")
    .sort({ dueDate: -1 });

  const hwIds = homeworkList.map(h => h._id);
  const submissions = await HomeworkSubmission.find({
    academyId: req.academy._id,
    homeworkId: { $in: hwIds },
    studentId: studentUserId,
  }).populate("gradedBy", "fullName");

  const subMap = new Map(submissions.map(s => [String(s.homeworkId), s]));
  const now = new Date();

  const enriched = homeworkList.map(h => {
    const sub = subMap.get(String(h._id));
    const isPastDue = now > new Date(h.dueDate);
    let computedStatus = "pending";
    if (sub) {
      computedStatus = sub.status;
    } else if (isPastDue) {
      computedStatus = "overdue";
    }

    return {
      ...h.toObject(),
      submission: sub || null,
      submissionStatus: computedStatus,
      isPastDue,
    };
  });

  const totalAssigned = enriched.length;
  const completed = enriched.filter(e => e.submission).length;
  const pending = enriched.filter(e => !e.submission && !e.isPastDue).length;
  const overdue = enriched.filter(e => !e.submission && e.isPastDue).length;

  res.status(200).json({
    success: true,
    summary: { totalAssigned, completed, pending, overdue },
    homework: enriched,
  });
});

module.exports = {
  createHomework,
  getHomeworkList,
  getHomeworkById,
  updateHomework,
  deleteHomework,
  submitHomework,
  gradeSubmission,
  getMyHomework,
  getChildHomework,
};
