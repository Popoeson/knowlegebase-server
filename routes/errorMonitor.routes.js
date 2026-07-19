const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth.middleware");
const { adminActionLimiter } = require("../middleware/rateLimit.middleware");
const { getRecentErrors } = require("../controllers/errorMonitor.controller");

router.get("/", protect, adminOnly, adminActionLimiter, getRecentErrors);

module.exports = router;