const express = require("express");
const router = express.Router();
const { getProfile, updateProfile, changePassword, getUserStats } = require("../controllers/user.controller");
const { protect } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("profilePhoto"), updateProfile);
router.put("/change-password", protect, changePassword);
router.get("/stats", protect, getUserStats);

module.exports = router;