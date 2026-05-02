const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { adminOnly } = require("../middleware/auth.middleware");
const {
    generateCertificate,
    getUserCertificates,
    getCertificate,
    verifyCertificate,
    getAllCertificates,
    revokeCertificate
} = require("../controllers/certificate.controller");

// @route   POST /api/certificates/generate
// @desc    Generate certificate for passed exam
// @access  Private
router.post("/generate", protect, generateCertificate);

// @route   GET /api/certificates
// @desc    Get all certificates for logged in user
// @access  Private
router.get("/", protect, getUserCertificates);

// @route   GET /api/certificates/:id
// @desc    Get single certificate
// @access  Private
router.get("/:id", protect, getCertificate);

// @route   GET /api/certificates/verify/:certificateId
// @desc    Verify a certificate publicly
// @access  Public
router.get("/verify/:certificateId", verifyCertificate);

// @route   GET /api/certificates/admin/all
// @desc    Get all certificates (admin)
// @access  Private/Admin
router.get("/admin/all", protect, adminOnly, getAllCertificates);

// @route   PATCH /api/certificates/admin/:id/revoke
// @desc    Revoke or reinstate a certificate
// @access  Private/Admin
router.patch("/admin/:id/revoke", protect, adminOnly, revokeCertificate);

module.exports = router;