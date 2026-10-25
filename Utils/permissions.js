/**
 * Centralized Permission Catalog & Security Helpers for MyAcademy
 */

const PERMISSIONS = Object.freeze({
  // Student Management
  STUDENTS_READ: "students.read",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",

  // Teacher Management
  TEACHERS_READ: "teachers.read",
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",

  // Batch Management
  BATCHES_READ: "batches.read",
  BATCHES_CREATE: "batches.create",
  BATCHES_UPDATE: "batches.update",
  BATCHES_DELETE: "batches.delete",

  // Course Management
  COURSES_READ: "courses.read",
  COURSES_CREATE: "courses.create",
  COURSES_UPDATE: "courses.update",
  COURSES_DELETE: "courses.delete",

  // Attendance Management
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_CREATE: "attendance.create",
  ATTENDANCE_UPDATE: "attendance.update",

  // Fee & Financial Management
  FEES_READ: "fees.read",
  FEES_CREATE: "fees.create",
  FEES_UPDATE: "fees.update",
  FEES_DELETE: "fees.delete",

  // Academic Assessments
  EXAMS_READ: "exams.read",
  EXAMS_MANAGE: "exams.manage",
  HOMEWORK_READ: "homework.read",
  HOMEWORK_MANAGE: "homework.manage",

  // Announcements & Reminders
  ANNOUNCEMENTS_MANAGE: "announcements.manage",
  REMINDERS_READ: "reminders.read",
  REMINDERS_SEND: "reminders.send",

  // Reports & Analytics
  REPORTS_READ: "reports.read",

  // Academy Settings
  ACADEMY_SETTINGS_READ: "academy_settings.read",
  ACADEMY_SETTINGS_UPDATE: "academy_settings.update",

  // Staff Management (Owner only)
  STAFF_READ: "staff.read",
  STAFF_INVITE: "staff.invite",
  STAFF_PERMISSIONS_MANAGE: "staff.permissions.manage",
});

const VALID_PERMISSIONS_LIST = Object.freeze(Object.values(PERMISSIONS));

// Permission categories for display, UI grouping, and bulk presets
const PERMISSION_CATEGORIES = Object.freeze([
  {
    category: "Students",
    description: "Admissions, directory, profiles, and student status updates",
    permissions: [
      { id: PERMISSIONS.STUDENTS_READ, label: "View Students", desc: "Browse student directory and profile details" },
      { id: PERMISSIONS.STUDENTS_CREATE, label: "Create Students", desc: "Admit new students individually or in bulk" },
      { id: PERMISSIONS.STUDENTS_UPDATE, label: "Edit Students", desc: "Update student details, approve or block accounts" },
      { id: PERMISSIONS.STUDENTS_DELETE, label: "Delete Students", desc: "Remove or soft-delete student accounts" },
    ],
  },
  {
    category: "Teachers",
    description: "Faculty management, instructor credentials, and assignments",
    permissions: [
      { id: PERMISSIONS.TEACHERS_READ, label: "View Teachers", desc: "Browse teacher directory and assigned courses" },
      { id: PERMISSIONS.TEACHERS_CREATE, label: "Add Teachers", desc: "Create new teacher accounts individually or in bulk" },
      { id: PERMISSIONS.TEACHERS_UPDATE, label: "Edit Teachers", desc: "Update teacher details and status" },
      { id: PERMISSIONS.TEACHERS_DELETE, label: "Delete Teachers", desc: "Remove teacher accounts" },
    ],
  },
  {
    category: "Batches & Courses",
    description: "Academic cohorts, curriculum, class schedules, and rosters",
    permissions: [
      { id: PERMISSIONS.BATCHES_READ, label: "View Batches", desc: "Inspect cohort schedules, roster and students" },
      { id: PERMISSIONS.BATCHES_CREATE, label: "Create Batches", desc: "Add new batches and enroll students into cohorts" },
      { id: PERMISSIONS.BATCHES_UPDATE, label: "Edit Batches", desc: "Update schedules, trainers, and cohort membership" },
      { id: PERMISSIONS.BATCHES_DELETE, label: "Delete Batches", desc: "Remove batch cohorts" },
      { id: PERMISSIONS.COURSES_READ, label: "View Courses", desc: "Browse course syllabus and subjects" },
      { id: PERMISSIONS.COURSES_CREATE, label: "Create Courses", desc: "Add new courses to the academy catalog" },
      { id: PERMISSIONS.COURSES_UPDATE, label: "Edit Courses", desc: "Update syllabus, publish or archive courses" },
      { id: PERMISSIONS.COURSES_DELETE, label: "Delete Courses", desc: "Delete courses from catalog" },
    ],
  },
  {
    category: "Attendance",
    description: "Student daily roll call and attendance registers",
    permissions: [
      { id: PERMISSIONS.ATTENDANCE_READ, label: "View Attendance", desc: "View batch roll call registers and dashboards" },
      { id: PERMISSIONS.ATTENDANCE_CREATE, label: "Mark Attendance", desc: "Record daily roll calls (Present/Absent/Leave)" },
      { id: PERMISSIONS.ATTENDANCE_UPDATE, label: "Update Attendance", desc: "Correct previously submitted roll calls" },
    ],
  },
  {
    category: "Fees & Financials",
    description: "Tuition fee structures, payment collection, receipts, and ledgers",
    permissions: [
      { id: PERMISSIONS.FEES_READ, label: "View Fees", desc: "View fee dashboards, student dues, transactions and receipts" },
      { id: PERMISSIONS.FEES_CREATE, label: "Collect Fees & Create Plans", desc: "Collect payments, issue receipts and create fee plans" },
      { id: PERMISSIONS.FEES_UPDATE, label: "Edit Fee Plans", desc: "Modify fee installment templates and plan terms" },
      { id: PERMISSIONS.FEES_DELETE, label: "Reverse Payments & Archive Plans", desc: "Perform payment reversals or archive fee plans" },
    ],
  },
  {
    category: "Exams & Homework",
    description: "Assessments, test schedules, grading, homework and report cards",
    permissions: [
      { id: PERMISSIONS.EXAMS_READ, label: "View Exams", desc: "View exam schedules, result sheets and student marks" },
      { id: PERMISSIONS.EXAMS_MANAGE, label: "Manage Exams", desc: "Create, update, delete exams and publish results" },
      { id: PERMISSIONS.HOMEWORK_READ, label: "View Homework", desc: "View homework assignments and submission files" },
      { id: PERMISSIONS.HOMEWORK_MANAGE, label: "Manage Homework", desc: "Create assignments, evaluate submissions and post grades" },
    ],
  },
  {
    category: "Communications & Alerts",
    description: "Broadcast announcements and automated WhatsApp reminders",
    permissions: [
      { id: PERMISSIONS.ANNOUNCEMENTS_MANAGE, label: "Manage Announcements", desc: "Post and edit batch or academy announcements" },
      { id: PERMISSIONS.REMINDERS_READ, label: "View Fee Reminders", desc: "Access WhatsApp reminder history, logs and settings" },
      { id: PERMISSIONS.REMINDERS_SEND, label: "Send Fee Reminders", desc: "Trigger manual or bulk fee payment reminders" },
    ],
  },
  {
    category: "Reports & Insights",
    description: "Executive dashboards, financial reports, and metrics",
    permissions: [
      { id: PERMISSIONS.REPORTS_READ, label: "View Reports & Analytics", desc: "Access revenue reports, cashbook ledgers and analytics" },
    ],
  },
  {
    category: "Academy Settings",
    description: "Academy profile, delivery modes, and branding",
    permissions: [
      { id: PERMISSIONS.ACADEMY_SETTINGS_READ, label: "View Academy Details", desc: "View academy profile and contact information" },
      { id: PERMISSIONS.ACADEMY_SETTINGS_UPDATE, label: "Update Academy Details", desc: "Modify logo, address, receipt notes and delivery mode" },
    ],
  },
]);

/**
 * Checks if a user has a specific permission.
 * - Platform Super Admins have all permissions.
 * - Academy Admins (owners) have all academy permissions.
 * - Academy Staff members must have the permission explicitly in their user.permissions array.
 */
function hasPermission(user, permission) {
  if (!user) return false;
  if (user.platformRole === "super_admin") return true;
  if (user.role === "admin") return true;
  if (user.role === "academy_staff") {
    if (!Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permission);
  }
  return false;
}

/**
 * Verifies if the user is the explicit owner of the academy.
 */
function isAcademyOwner(user, academy) {
  if (!user || !academy) return false;
  if (user.platformRole === "super_admin") return true;
  const ownerId = academy.owner?._id || academy.owner;
  const userId = user._id || user.id;
  if (user.role === "admin" && ownerId && String(ownerId) === String(userId)) {
    return true;
  }
  return false;
}

module.exports = {
  PERMISSIONS,
  VALID_PERMISSIONS_LIST,
  PERMISSION_CATEGORIES,
  hasPermission,
  isAcademyOwner,
};
