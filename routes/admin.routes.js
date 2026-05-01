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
    deleteCategory
} = require("../controllers/admin.controller");

const {
    getQuestions,
    addQuestion,
    editQuestion,
    deleteQuestion,
    bulkUploadQuestions,
    downloadTemplate
} = require("../controllers/question.controller");

// All admin routes are protected
router.use(protect, adminOnly);

// ── DASHBOARD ──
// @route   GET /api/admin/stats
router.get("/stats", getDashboardStats);

// ── USERS ──
// @route   GET /api/admin/users
router.get("/users", getUsers);

// @route   DELETE /api/admin/users/:id
router.delete("/users/:id", deleteUser);

// ── COURSES ──
// @route   GET /api/admin/courses
router.get("/courses", getAllCourses);

// @route   POST /api/admin/courses
router.post("/courses", upload.single("thumbnail"), createCourse);

// @route   PUT /api/admin/courses/:id
router.put("/courses/:id", upload.single("thumbnail"), editCourse);

// @route   PATCH /api/admin/courses/:id/toggle
router.patch("/courses/:id/toggle", toggleCourseStatus);

// @route   DELETE /api/admin/courses/:id
router.delete("/courses/:id", deleteCourse);

// ── CATEGORIES ──
// @route   GET /api/admin/categories
router.get("/categories", getCategories);

// @route   POST /api/admin/categories
router.post("/categories", createCategory);

// @route   PUT /api/admin/categories/:id
router.put("/categories/:id", editCategory);

// @route   DELETE /api/admin/categories/:id
router.delete("/categories/:id", deleteCategory);

// ── QUESTIONS ──
// @route   GET /api/admin/questions
router.get("/questions", getQuestions);

// @route   POST /api/admin/questions
router.post("/questions", addQuestion);

// @route   PUT /api/admin/questions/:id
router.put("/questions/:id", editQuestion);

// @route   DELETE /api/admin/questions/:id
router.delete("/questions/:id", deleteQuestion);

// @route   POST /api/admin/questions/bulk-upload
router.post("/questions/bulk-upload", excelUpload.single("file"), bulkUploadQuestions);

// @route   GET /api/admin/questions/template
router.get("/questions/template", downloadTemplate);

module.exports = router;