const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth.middleware");
const { adminActionLimiter } = require("../middleware/rateLimit.middleware");
const { getActivityStats, getActivityFeed, getUserActivity } = require("../controllers/activity.controller");

router.use(protect, adminOnly, adminActionLimiter);

router.get("/stats", getActivityStats);
router.get("/feed", getActivityFeed);
router.get("/user/:userId", getUserActivity);

module.exports = router;