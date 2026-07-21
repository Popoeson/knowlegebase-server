const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth.middleware");
const { moderateLimiter, adminActionLimiter } = require("../middleware/rateLimit.middleware");
const {
    generateCertificate,
    getUserCertificates,
    getCertificate,
    verifyCertificate,
    getAllCertificates,
    revokeCertificate
} = require("../controllers/certificate.controller");

// @route   POST /api/certificates/generate
router.post("/generate", protect, moderateLimiter, generateCertificate);

// @route   GET /api/certificates/verify/:certificateId
// PUBLIC — must be above /:id to prevent route conflict
router.get("/verify/:certificateId", moderateLimiter, verifyCertificate);

// @route   GET /api/certificates/admin/all
router.get("/admin/all", protect, adminOnly, adminActionLimiter, getAllCertificates);

// @route   PATCH /api/certificates/admin/:id/revoke
router.patch("/admin/:id/revoke", protect, adminOnly, adminActionLimiter, revokeCertificate);

// @route   GET /api/certificates
router.get("/", protect, getUserCertificates);

// @route   GET /api/certificates/:id
// Must be last to avoid catching other routes
router.get("/:id", protect, getCertificate);

module.exports = router;