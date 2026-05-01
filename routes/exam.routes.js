const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
    startAttempt,
    saveAnswer,
    submitAttempt,
    getAttemptResult,
    getUserAttempts,
    checkPaymentStatus
} = require("../controllers/exam.controller");

// @route   POST /api/exam/start
// @desc    Start a new exam attempt
// @access  Private
router.post("/start", protect, startAttempt);

// @route   POST /api/exam/save-answer
// @desc    Auto-save a single answer
// @access  Private
router.post("/save-answer", protect, saveAnswer);

// @route   POST /api/exam/submit
// @desc    Submit exam attempt
// @access  Private
router.post("/submit", protect, submitAttempt);

// @route   GET /api/exam/attempts
// @desc    Get user exam history
// @access  Private
router.get("/attempts", protect, getUserAttempts);

// @route   GET /api/exam/result/:id
// @desc    Get single attempt result
// @access  Private
router.get("/result/:id", protect, getAttemptResult);

// @route   GET /api/exam/payment-status/:courseId
// @desc    Check if user has valid payment for a course
// @access  Private
router.get("/payment-status/:courseId", protect, checkPaymentStatus);

module.exports = router;