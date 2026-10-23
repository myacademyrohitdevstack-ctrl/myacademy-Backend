const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const { assertFeatureEnabled } = require("../Utils/planEnforcer");
const Exam = require("../Modals/Exam");
const ExamResult = require("../Modals/ExamResult");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
const ParentStudent = require("../Modals/ParentStudent");

// Helper to determine letter grade
const calculateGrade = (percentage, isPassed) => {
  if (!isPassed) return "F";
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  return "D";
};

// 1. Create Exam (Admin or Teacher)
const createExam = asyncHandler(async (req, res) => {
  const { batchId, title, subject, examDate, durationMinutes = 60, totalMarks = 100, passingMarks = 35, instructions = "" } = req.body;

  if (!batchId || !title || !examDate) {
    return res.status(400).json({ success: false, message: "Batch, title, and exam date are required." });
  }

  const batch = await Batch.findOne({ _id: batchId, academyId: req.academy._id, isDeleted: false });
  if (!batch) {
    return res.status(404).json({ success: false, message: "Batch not found." });
  }

  const exam = await Exam.create({
    academyId: req.academy._id,
    batchId: batch._id,
    courseId: batch.course || null,
    title: title.trim(),
    subject: subject?.trim() || "",
    examDate: new Date(examDate),
    durationMinutes: Number(durationMinutes) || 60,
    totalMarks: Number(totalMarks) || 100,
    passingMarks: Number(passingMarks) || 35,
    instructions: instructions?.trim() || "",
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, message: "Exam created successfully.", exam });
});

// 2. Get Exams List (Admin or Teacher)
const getExams = asyncHandler(async (req, res) => {
  const { batchId, status } = req.query;
  const filter = { academyId: req.academy._id, isDeleted: false };

  if (batchId) filter.batchId = batchId;
  if (status) filter.status = status;

  // If teacher, optionally filter to teacher assigned batches
  if (req.user.role === "teacher") {
    const teacherBatches = await Batch.find({
      academyId: req.academy._id,
      trainers: req.user._id,
      isDeleted: false,
    }).select("_id");
    const batchIds = teacherBatches.map(b => b._id);
    filter.batchId = batchId ? batchId : { $in: batchIds };
  }

  const exams = await Exam.find(filter)
    .populate("batchId", "name startDate endDate")
    .populate("courseId", "title")
    .sort({ examDate: -1 });

  // Enrich with result counts
  const examIds = exams.map(e => e._id);
  const resultsCounts = await ExamResult.aggregate([
    { $match: { examId: { $in: examIds } } },
    { $group: { _id: "$examId", count: { $sum: 1 }, avgScore: { $avg: "$percentage" }, passCount: { $sum: { $cond: ["$isPassed", 1, 0] } } } }
  ]);
  const statsMap = new Map(resultsCounts.map(r => [String(r._id), r]));

  const enrichedExams = exams.map(e => {
    const stats = statsMap.get(String(e._id));
    return {
      ...e.toObject(),
      gradedCount: stats?.count || 0,
      averagePercentage: stats ? Math.round(stats.avgScore * 10) / 10 : null,
      passedCount: stats?.passCount || 0,
    };
  });

  res.status(200).json({ success: true, count: enrichedExams.length, exams: enrichedExams });
});

// 3. Get Single Exam with Full Results & Batch Students
const getExamById = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false })
    .populate("batchId", "name students course")
    .populate("courseId", "title")
    .populate("createdBy", "fullName email");

  if (!exam) {
    return res.status(404).json({ success: false, message: "Exam not found." });
  }

  // Load batch students details
  const studentIds = exam.batchId?.students || [];
  const students = await User.find({ _id: { $in: studentIds }, isDeleted: false })
    .select("fullName email phone profileImage status");

  // Load recorded results
  const results = await ExamResult.find({ examId: exam._id, academyId: req.academy._id })
    .populate("studentId", "fullName email phone profileImage")
    .populate("gradedBy", "fullName");

  res.status(200).json({ success: true, exam, students, results });
});

// 4. Update Exam Details
const updateExam = asyncHandler(async (req, res) => {
  const { title, subject, examDate, durationMinutes, totalMarks, passingMarks, instructions, status } = req.body;
  const exam = await Exam.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });

  if (!exam) {
    return res.status(404).json({ success: false, message: "Exam not found." });
  }

  if (title) exam.title = title.trim();
  if (subject !== undefined) exam.subject = subject.trim();
  if (examDate) exam.examDate = new Date(examDate);
  if (durationMinutes) exam.durationMinutes = Number(durationMinutes);
  if (totalMarks) exam.totalMarks = Number(totalMarks);
  if (passingMarks) exam.passingMarks = Number(passingMarks);
  if (instructions !== undefined) exam.instructions = instructions.trim();
  if (status) exam.status = status;

  await exam.save();
  res.status(200).json({ success: true, message: "Exam updated successfully.", exam });
});

// 5. Delete Exam
const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });
  if (!exam) {
    return res.status(404).json({ success: false, message: "Exam not found." });
  }

  exam.isDeleted = true;
  await exam.save();
  await ExamResult.deleteMany({ examId: exam._id });

  res.status(200).json({ success: true, message: "Exam and marks deleted successfully." });
});

// 6. Save / Submit Bulk Exam Results (Admin or Teacher)
const saveExamResults = asyncHandler(async (req, res) => {
  const { results = [] } = req.body; // Array of { studentId, marksObtained, remarks }
  const exam = await Exam.findOne({ _id: req.params.id, academyId: req.academy._id, isDeleted: false });

  if (!exam) {
    return res.status(404).json({ success: false, message: "Exam not found." });
  }

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ success: false, message: "Results list is required." });
  }

  const ops = [];
  for (const item of results) {
    const marks = Number(item.marksObtained);
    if (isNaN(marks) || marks < 0) continue;

    const percentage = Math.round((marks / exam.totalMarks) * 100 * 10) / 10;
    const isPassed = marks >= exam.passingMarks;
    const grade = calculateGrade(percentage, isPassed);

    ops.push({
      updateOne: {
        filter: { academyId: req.academy._id, examId: exam._id, studentId: item.studentId },
        update: {
          $set: {
            batchId: exam.batchId,
            marksObtained: marks,
            totalMarks: exam.totalMarks,
            percentage,
            grade,
            isPassed,
            remarks: item.remarks?.trim() || "",
            gradedBy: req.user._id,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length > 0) {
    await ExamResult.bulkWrite(ops);
    exam.isResultsPublished = true;
    exam.status = "completed";
    await exam.save();
  }

  res.status(200).json({ success: true, message: "Exam results saved and published successfully." });
});

// 7. Student: Get My Exam Results
const getMyExamResults = asyncHandler(async (req, res) => {
  const results = await ExamResult.find({ studentId: req.user._id, academyId: req.academy._id })
    .populate({
      path: "examId",
      match: { isDeleted: false },
      populate: [
        { path: "batchId", select: "name" },
        { path: "courseId", select: "title" },
      ],
    })
    .sort({ createdAt: -1 });

  // Filter out any results where exam was soft-deleted
  const validResults = results.filter(r => r.examId);

  // Compute overall performance summary
  const totalExams = validResults.length;
  const passedExams = validResults.filter(r => r.isPassed).length;
  const avgPercentage = totalExams > 0 ? Math.round((validResults.reduce((acc, r) => acc + r.percentage, 0) / totalExams) * 10) / 10 : 0;

  res.status(200).json({
    success: true,
    summary: { totalExams, passedExams, avgPercentage },
    results: validResults,
  });
});

// 8. Parent: Get Linked Child Exam Results
const getChildExamResults = asyncHandler(async (req, res) => {
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

  const results = await ExamResult.find({ studentId: studentUserId, academyId: req.academy._id })
    .populate({
      path: "examId",
      match: { isDeleted: false },
      populate: [
        { path: "batchId", select: "name" },
        { path: "courseId", select: "title" },
      ],
    })
    .sort({ createdAt: -1 });

  const validResults = results.filter(r => r.examId);
  const totalExams = validResults.length;
  const passedExams = validResults.filter(r => r.isPassed).length;
  const avgPercentage = totalExams > 0 ? Math.round((validResults.reduce((acc, r) => acc + r.percentage, 0) / totalExams) * 10) / 10 : 0;

  res.status(200).json({
    success: true,
    summary: { totalExams, passedExams, avgPercentage },
    results: validResults,
  });
});

module.exports = {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  saveExamResults,
  getMyExamResults,
  getChildExamResults,
};
