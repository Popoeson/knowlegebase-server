const express = require("express");
const router = express.Router();
const { protect, adminOnly, superAdminOnly } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const excelUpload = require("../middleware/excel.middleware");
const { verifyImageSignature, verifyExcelSignature } = require("../middleware/verifyFileSignature.middleware");

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
    rejectAIQuestions,
    getAdmins,
    searchUsersByEmail,
    updateUserRole
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

const {
    getAllTransactions,
    deleteTransaction,
    bulkDeleteTransactions
} = require("../controllers/payment.controller");

const { aiGenerateLimiter } = require("../middleware/rateLimit.middleware");

const {
    getAllCertificates,
    revokeCertificate
} = require("../controllers/certificate.controller");

const { adminActionLimiter } = require("../middleware/rateLimit.middleware");

// All admin routes are protected, and rate-limited as a group — caps how
// much damage a stolen/leaked admin token can do per window, without
// getting in the way of legitimate bulk admin work.
// adminOnly here covers both "admin" and "superadmin" — it's the read/view
// gate. Individual write/destructive routes below add superAdminOnly on top.
router.use(protect, adminOnly, adminActionLimiter);

// ── DASHBOARD ──
router.get("/stats", getDashboardStats);

// ── USERS ──
router.get("/users", getUsers);
router.delete("/users/:id", superAdminOnly, deleteUser);

// ── ADMIN MANAGEMENT (superadmin only) ──
router.get("/admins", superAdminOnly, getAdmins);
router.get("/users/search", superAdminOnly, searchUsersByEmail);
router.patch("/users/:id/role", superAdminOnly, updateUserRole);

// ── COURSES ──
router.get("/courses", getAllCourses);
router.post("/courses", superAdminOnly, upload.single("thumbnail"), verifyImageSignature, createCourse);
router.put("/courses/:id", superAdminOnly, upload.single("thumbnail"), verifyImageSignature, editCourse);
router.patch("/courses/:id/toggle", superAdminOnly, toggleCourseStatus);
router.delete("/courses/:id", superAdminOnly, deleteCourse);

// ── CATEGORIES ──
router.get("/categories", getCategories);
router.post("/categories", superAdminOnly, createCategory);
router.put("/categories/:id", superAdminOnly, editCategory);
router.delete("/categories/:id", superAdminOnly, deleteCategory);

// ── QUESTIONS ──
router.get("/questions", getQuestions);
router.post("/questions", superAdminOnly, addQuestion);
router.put("/questions/:id", superAdminOnly, editQuestion);
router.post("/questions/bulk-upload", superAdminOnly, excelUpload.single("file"), verifyExcelSignature, bulkUploadQuestions);
router.get("/questions/template", superAdminOnly, downloadTemplate);
router.delete("/questions/bulk-delete", superAdminOnly, bulkDeleteQuestions);   
router.delete("/questions/:id", superAdminOnly, deleteQuestion);  

// ── AI QUESTION GENERATION ──
// Order matters: specific paths must come before parameterised ones
router.post("/questions/ai-generate", superAdminOnly, aiGenerateLimiter, generateQuestionsWithAI);
router.post("/questions/ai-save", superAdminOnly, saveApprovedQuestions);
router.post("/questions/ai-reject", superAdminOnly, rejectAIQuestions);

// ── TRANSACTIONS ──
// Order matters: bulk-delete must come before the parameterised :id route
router.get("/transactions", getAllTransactions);
router.delete("/transactions/bulk-delete", superAdminOnly, bulkDeleteTransactions);
router.delete("/transactions/:id", superAdminOnly, deleteTransaction);

// ── CERTIFICATES ──
router.get("/certificates", getAllCertificates);
router.patch("/certificates/:id/revoke", superAdminOnly, revokeCertificate);

module.exports = router;