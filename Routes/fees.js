const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const fees = require("../Controllers/fees");

const router = express.Router();
router.use(protect, authorize("admin"));

router.get("/dashboard", fees.getDashboard);
router.get("/reports", fees.getReports);
router.get("/students", fees.searchFeeStudents);
router.get("/batches", fees.listAcademyBatches);
router.get("/plans", fees.listFeePlans);
router.post("/plans", fees.createFeePlan);
router.patch("/plans/:id", fees.updateFeePlan);
router.delete("/plans/:id", fees.archiveFeePlan);

router.get("/student-fees", fees.listStudentFees);
router.post("/assign", fees.assignFee);
router.get("/students/:studentId/summary", fees.getStudentFeeSummary);
router.get("/pending", fees.getPendingFees);

router.post("/payments", fees.collectPayment);
router.get("/payments", fees.listPayments);
router.get("/payments/:id/receipt", fees.getReceipt);
router.post("/payments/:id/reverse", fees.reversePayment);

module.exports = router;
