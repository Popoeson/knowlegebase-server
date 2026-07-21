const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth.middleware");
const { adminActionLimiter } = require("../middleware/rateLimit.middleware");
const { getBackupStatus, exportBackup } = require("../controllers/backup.controller");

router.use(protect, adminOnly, adminActionLimiter);

router.get("/status", getBackupStatus);
router.get("/export", exportBackup);

module.exports = router;