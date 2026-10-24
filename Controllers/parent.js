const bcrypt = require("bcryptjs");
const mongoose = require('mongoose');
const asyncHandler = require('../Utils/asyncHandler');
const ParentStudent = require('../Modals/ParentStudent');
const Student = require('../Modals/Student');
const User = require('../Modals/User');
const Batch = require('../Modals/Batches');
const Attendance = require('../Modals/Attendence');
const Announcement = require('../Modals/Announcement');
const StudentFee = require('../Modals/StudentFee');
const FeePayment = require('../Modals/FeePayment');

const getLinkedStudentIds = async (req) => {
  const links = await ParentStudent.find({ academyId: req.academy._id, parentId: req.user._id, status: 'active' }).select('studentUserId relationship isPrimary');
  return links;
};

const getMyChildren = asyncHandler(async (req, res) => {
  const links = await getLinkedStudentIds(req);
  const ids = links.map(x => x.studentUserId);
  const students = await Student.find({ academyId: req.academy._id, user: { $in: ids }, isDeleted: false })
    .populate({ path: 'user', select: 'fullName email phone profileImage status', match: { academyId: req.academy._id, role: 'student', isDeleted: false } });
  const linkMap = new Map(links.map(x => [String(x.studentUserId), x]));
  const children = students.filter(s => s.user).map(s => ({ ...s.toObject(), parentRelationship: linkMap.get(String(s.user._id))?.relationship, isPrimary: linkMap.get(String(s.user._id))?.isPrimary || false }));
  res.json({ success: true, count: children.length, children });
});

const getChildDashboard = asyncHandler(async (req, res) => {
  const { studentUserId } = req.params;
  if (!mongoose.isValidObjectId(studentUserId)) return res.status(400).json({ success: false, message: 'Invalid student ID.' });
  const link = await ParentStudent.findOne({ academyId: req.academy._id, parentId: req.user._id, studentUserId, status: 'active' });
  if (!link) return res.status(404).json({ success: false, message: 'Linked student not found.' });
  const studentDoc = await Student.findOne({
    $or: [{ user: studentUserId }, { _id: studentUserId }],
    academyId: req.academy._id,
    isDeleted: false,
  });

  const matchedIds = [
    studentUserId,
    studentDoc?._id,
    studentDoc?.user,
  ].filter(Boolean);

  const [student, profile, batches, attendance] = await Promise.all([
    User.findOne({
      $or: [{ _id: studentUserId }, { _id: studentDoc?.user }],
      academyId: req.academy._id,
      role: 'student',
      isDeleted: false,
    }).select('fullName email phone profileImage status'),
    studentDoc,
    Batch.find({
      academyId: req.academy._id,
      students: { $in: matchedIds },
      isDeleted: false,
    }).populate('course', 'title name').populate('trainers', 'fullName'),
    Attendance.find({
      academyId: req.academy._id,
      isDeleted: false,
      'records.student': { $in: matchedIds },
    }).populate('batch', 'name').sort({ date: -1 }).limit(30).select('batch date records'),
  ]);
  if (!student) return res.status(404).json({ success: false, message: 'Student record not found.' });
  const records = attendance.map(a => ({
    date: a.date,
    batch: a.batch?._id || a.batch,
    batchName: a.batch?.name || 'Classroom Session',
    status: a.records.find(r => matchedIds.some(id => String(id) === String(r.student)))?.status || null
  }));
  const marked = records.filter(r => ['present', 'absent', 'leave'].includes(r.status));
  const present = marked.filter(r => r.status === 'present').length;
  const leave = marked.filter(r => r.status === 'leave').length;
  const absent = marked.filter(r => r.status === 'absent').length;
  const attendancePercentage = marked.length ? Math.round((present / marked.length) * 100) : null;

  let currentStreak = 0;
  for (const item of records) {
    if (item.status === 'present') {
      currentStreak++;
    } else if (item.status === 'absent' || item.status === 'leave') {
      break;
    }
  }

  const attendanceSummary = {
    totalClasses: marked.length,
    present,
    leave,
    absent,
    total: marked.length,
    percentage: attendancePercentage,
    currentStreak,
    requiredPercentage: 75,
    isEligible: attendancePercentage === null || attendancePercentage >= 75,
  };

  const announcements = await Announcement.find({ academyId: req.academy._id, isDeleted: false, isPublished: true, publishAt: { $lte: new Date() }, $or: [{ targetType: 'system' }, { targetType: 'course', course: { $in: batches.map(b => b.course?._id).filter(Boolean) } }, { targetType: 'batch', batch: { $in: batches.map(b => b._id) } }] }).sort({ isPinned: -1, publishAt: -1 }).limit(10).select('title message targetType priority publishAt expiresAt batch course');
  res.json({ success: true, data: { student, profile, batches, attendance: records, attendancePercentage, attendanceSummary, announcements } });
});

const getChildAttendance = asyncHandler(async (req, res) => {
  const { studentUserId } = req.params;
  if (!mongoose.isValidObjectId(studentUserId)) return res.status(400).json({ success: false, message: 'Invalid student ID.' });
  const link = await ParentStudent.exists({ academyId: req.academy._id, parentId: req.user._id, studentUserId, status: 'active' });
  if (!link) return res.status(404).json({ success: false, message: 'Linked student not found.' });
  const { from, to } = req.query;
  const studentDoc = await Student.findOne({
    $or: [{ user: studentUserId }, { _id: studentUserId }],
    academyId: req.academy._id,
    isDeleted: false,
  });
  const matchedIds = [studentUserId, studentDoc?._id, studentDoc?.user].filter(Boolean);

  const query = { academyId: req.academy._id, isDeleted: false, 'records.student': { $in: matchedIds } };
  if (from || to) query.date = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
  const docs = await Attendance.find(query).populate('batch', 'name').sort({ date: -1 }).limit(180).select('batch date records');
  const attendance = docs.map(d => ({
    batch: d.batch?._id || d.batch,
    batchName: d.batch?.name || 'Classroom Session',
    date: d.date,
    status: d.records.find(r => matchedIds.some(id => String(id) === String(r.student)))?.status || null
  }));
  const marked = attendance.filter(x => ['present', 'absent', 'leave'].includes(x.status));
  const present = marked.filter(x => x.status === 'present').length;
  const leave = marked.filter(x => x.status === 'leave').length;
  const absent = marked.filter(x => x.status === 'absent').length;
  res.json({
    success: true,
    count: attendance.length,
    attendance,
    summary: {
      totalClasses: marked.length,
      present,
      leave,
      absent,
      percentage: marked.length ? Math.round(present / marked.length * 100) : null
    }
  });
});


const getChildFees = asyncHandler(async (req, res) => {
  const { studentUserId } = req.params;
  if (!mongoose.isValidObjectId(studentUserId)) return res.status(400).json({ success: false, message: 'Invalid student ID.' });
  const link = await ParentStudent.exists({ academyId: req.academy._id, parentId: req.user._id, studentUserId, status: 'active' });
  if (!link) return res.status(404).json({ success: false, message: 'Linked student not found.' });
  const [fees, payments] = await Promise.all([
    StudentFee.find({ academyId: req.academy._id, student: studentUserId }).sort({ createdAt: -1 }).select('feePlan feePlanName totalAmount discountAmount scholarshipAmount additionalCharges totalPayable paidAmount balanceAmount status installments createdAt').populate('feePlan', 'name'),
    FeePayment.find({ academyId: req.academy._id, student: studentUserId, status: 'completed' }).sort({ paidAt: -1 }).limit(100).select('studentFee receiptNo amount mode paidAt referenceNumber remarks status'),
  ]);
  res.json({ success: true, fees, payments });
});

const linkChild = asyncHandler(async (req, res) => {
  const { parentId, studentUserId, relationship = 'guardian', isPrimary = false } = req.body;
  if (!mongoose.isValidObjectId(parentId) || !mongoose.isValidObjectId(studentUserId)) return res.status(400).json({ success: false, message: 'Valid parentId and studentUserId are required.' });
  const [parent, child] = await Promise.all([
    User.findOne({ _id: parentId, academyId: req.academy._id, role: 'parent', isDeleted: false }),
    User.findOne({ _id: studentUserId, academyId: req.academy._id, role: 'student', isDeleted: false }),
  ]);
  if (!parent || !child) return res.status(404).json({ success: false, message: 'Parent or student was not found in this academy.' });
  const link = await ParentStudent.findOneAndUpdate(
    { academyId: req.academy._id, parentId, studentUserId },
    { $set: { relationship, isPrimary, status: 'active', createdBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.status(200).json({ success: true, message: 'Parent linked to student.', link });
});

const unlinkChild = asyncHandler(async (req, res) => {
  const { parentId, studentUserId } = req.params;
  const link = await ParentStudent.findOneAndUpdate({ academyId: req.academy._id, parentId, studentUserId, status: 'active' }, { $set: { status: 'revoked' } }, { new: true });
  if (!link) return res.status(404).json({ success: false, message: 'Active parent-student link not found.' });
  res.json({ success: true, message: 'Parent link revoked.' });
});

const listParentLinks = asyncHandler(async (req, res) => {
  const links = await ParentStudent.find({ academyId: req.academy._id, status: 'active' })
    .populate('parentId', 'fullName email phone status')
    .populate('studentUserId', 'fullName email phone status')
    .sort({ createdAt: -1 });
  res.json({ success: true, count: links.length, links });
});


const createParent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, studentUserId, relationship = "guardian", isPrimary = false } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Full name, email, and password are required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "An account with this email already exists in this academy.",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const parent = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: phone ? phone.trim() : "",
    password: hashedPassword,
    role: "parent",
    platformRole: "user",
    academyId: req.academy._id,
    approvalStatus: "approved",
    status: "active",
  });

  let linkedStudent = null;
  if (studentUserId && mongoose.isValidObjectId(studentUserId)) {
    const student = await User.findOne({
      _id: studentUserId,
      academyId: req.academy._id,
      role: "student",
      isDeleted: false,
    });

    if (student) {
      linkedStudent = await ParentStudent.findOneAndUpdate(
        { academyId: req.academy._id, parentId: parent._id, studentUserId },
        { $set: { relationship, isPrimary, status: "active", createdBy: req.user._id } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
  }

  res.status(201).json({
    success: true,
    message: linkedStudent
      ? "Parent account created and linked to student successfully."
      : "Parent account created successfully.",
    user: {
      _id: parent._id,
      fullName: parent.fullName,
      email: parent.email,
      phone: parent.phone,
      role: parent.role,
    },
    linkedStudent,
  });
});

module.exports = {
  createParent, getMyChildren, getChildDashboard, getChildAttendance, getChildFees, linkChild, unlinkChild, listParentLinks };
