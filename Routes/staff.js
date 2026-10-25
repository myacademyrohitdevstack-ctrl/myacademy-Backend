const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const { requireAcademyOwner } = require("../Middleware/authorizePermission");
const {
  getStaffCatalog,
  getStaffMembers,
  getStaffMemberById,
  createStaffMember,
  updateStaffPermissions,
  updateStaffProfile,
  updateStaffStatus,
  deleteStaffMember,
} = require("../Controllers/staff");

// All staff management routes require valid authentication & Academy Owner authority
router.use(protect);
router.use(requireAcademyOwner);

// Catalog / Allowlist definition
router.get("/permissions-catalog", getStaffCatalog);

// Staff CRUD
router.get("/", getStaffMembers);
router.post("/", createStaffMember);
router.get("/:id", getStaffMemberById);
router.patch("/:id/permissions", updateStaffPermissions);
router.patch("/:id/profile", updateStaffProfile);
router.patch("/:id/status", updateStaffStatus);
router.delete("/:id", deleteStaffMember);

module.exports = router;
