const express = require("express");
const protect = require("../Middleware/protect");
const {
  requirePermission,
  requireAnyPermission,
} = require("../Middleware/authorizePermission");
const fees = require("../Controllers/fees");

const router = express.Router();
router.use(protect);

router.get("/dashboard", requireAnyPermission("fees.read", "reports.read"), fees.getDashboard);
router.get("/reports", requireAnyPermission("fees.read", "reports.read"), fees.getReports);
router.get("/students", requirePermission("fees.read"), fees.searchFeeStudents);
router.get("/batches", requirePermission("fees.read"), fees.listAcademyBatches);
router.get("/plans", requirePermission("fees.read"), fees.listFeePlans);
router.post("/plans", requirePermission("fees.create"), fees.createFeePlan);
router.patch("/plans/:id", requirePermission("fees.update"), fees.updateFeePlan);
router.delete("/plans/:id", requirePermission("fees.delete"), fees.archiveFeePlan);

router.get("/student-fees", requirePermission("fees.read"), fees.listStudentFees);
router.post("/assign", requirePermission("fees.create"), fees.assignFee);
router.get("/students/:studentId/summary", requirePermission("fees.read"), fees.getStudentFeeSummary);
router.get("/pending", requirePermission("fees.read"), fees.getPendingFees);

router.post("/payments", requirePermission("fees.create"), fees.collectPayment);
router.get("/payments", requirePermission("fees.read"), fees.listPayments);
router.get("/payments/:id/receipt", requirePermission("fees.read"), fees.getReceipt);
router.post("/payments/:id/reverse", requirePermission("fees.delete"), fees.reversePayment);

module.exports = router;
