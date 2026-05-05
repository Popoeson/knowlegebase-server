const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const excelUpload = require("../middleware/excel.middleware");

const {
    getDashboardStats,
    getUsers,
    deleteUser,
    getAllCourses,
    createCourse,
    editCourse,
    toggleCourseStatus,
    deleteCourse,
    getCategories,
    createCategory,
    editCategory,
    deleteCategory,
    generateQuestionsWithAI,
    saveApprovedQuestions,
    rejectAIQuestions
} = require("../controllers/admin.controller");

const {
    getQuestions,
    addQuestion,
    editQuestion,
    deleteQuestion,
    bulkUploadQuestions,
    downloadTemplate,
    bulkDeleteQuestions
} = require("../controllers/question.controller");

const { getAllTransactions } = require("../controllers/payment.controller");

const {
    getAllCertificates,
    revokeCertificate
} = require("../controllers/certificate.controller");

// All admin routes are protected
router.use(protect, adminOnly);

// ── DASHBOARD ──
router.get("/stats", getDashboardStats);

// ── USERS ──
router.get("/users", getUsers);
router.delete("/users/:id", deleteUser);

// ── COURSES ──
router.get("/courses", getAllCourses);
router.post("/courses", upload.single("thumbnail"), createCourse);
router.put("/courses/:id", upload.single("thumbnail"), editCourse);
router.patch("/courses/:id/toggle", toggleCourseStatus);
router.delete("/courses/:id", deleteCourse);

// ── CATEGORIES ──
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", editCategory);
router.delete("/categories/:id", deleteCategory);

// ── QUESTIONS ──
router.get("/questions", getQuestions);
router.post("/questions", addQuestion);
router.put("/questions/:id", editQuestion);
router.delete("/questions/:id", deleteQuestion);
router.post("/questions/bulk-upload", excelUpload.single("file"), bulkUploadQuestions);
router.get("/questions/template", downloadTemplate);
// @route   DELETE /api/admin/questions/bulk-delete
router.delete("/questions/bulk-delete", bulkDeleteQuestions);

// ── AI QUESTION GENERATION ──
// Order matters: specific paths must come before parameterised ones
router.post("/questions/ai-generate", generateQuestionsWithAI);
router.post("/questions/ai-save", saveApprovedQuestions);
router.post("/questions/ai-reject", rejectAIQuestions);

// ── TRANSACTIONS ──
router.get("/transactions", getAllTransactions);

// ── CERTIFICATES ──
router.get("/certificates", getAllCertificates);
router.patch("/certificates/:id/revoke", revokeCertificate);

module.exports = router;