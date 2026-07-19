const express = require("express");
const router = express.Router();
const { getProfile, updateProfile, changePassword, getUserStats } = require("../controllers/user.controller");
const { protect } = require("../middleware/auth.middleware");
const { moderateLimiter } = require("../middleware/rateLimit.middleware");
const upload = require("../middleware/upload.middleware");
const { verifyImageSignature } = require("../middleware/verifyFileSignature.middleware");

router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("profilePhoto"), verifyImageSignature, moderateLimiter, updateProfile);
router.put("/change-password", protect, moderateLimiter, changePassword);
router.get("/stats", protect, getUserStats);

module.exports = router;