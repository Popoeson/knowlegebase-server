const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { examActionLimiter, examAutosaveLimiter } = require("../middleware/rateLimit.middleware");
const {
    startAttempt,
    saveAnswer,
    submitAttempt,
    getAttemptResult,
    getUserAttempts
} = require("../controllers/exam.controller");

router.post("/start", protect, examActionLimiter, startAttempt);
router.post("/save-answer", protect, examAutosaveLimiter, saveAnswer);
router.post("/submit", protect, examActionLimiter, submitAttempt);
router.get("/attempts", protect, getUserAttempts);
router.get("/result/:id", protect, getAttemptResult);

module.exports = router;