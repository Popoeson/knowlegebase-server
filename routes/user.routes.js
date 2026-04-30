const express = require("express");
const router = express.Router();
const { getProfile, updateProfile, changePassword } = require("../controllers/user.controller");
const { protect } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

// @route   GET /api/user/profile
// @desc    Get logged in user profile
// @access  Private
router.get("/profile", protect, getProfile);

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", protect, upload.single("profilePhoto"), updateProfile);

// @route   PUT /api/user/change-password
// @desc    Change password
// @access  Private
router.put("/change-password", protect, changePassword);

module.exports = router;