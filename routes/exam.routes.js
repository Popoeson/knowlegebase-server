const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
    startAttempt,
    saveAnswer,
    submitAttempt,
    getAttemptResult,
    getUserAttempts
} = require("../controllers/exam.controller");

// @route   POST /api/exam/start
router.post("/start", protect, startAttempt);

// @route   POST /api/exam/save-answer
router.post("/save-answer", protect, saveAnswer);

// @route   POST /api/exam/submit
router.post("/submit", protect, submitAttempt);

// @route   GET /api/exam/attempts
router.get("/attempts", protect, getUserAttempts);

// @route   GET /api/exam/result/:id
router.get("/result/:id", protect, getAttemptResult);

module.exports = router;