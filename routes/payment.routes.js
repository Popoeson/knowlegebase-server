const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
    initializeCertificatePayment,
    verifyCertificatePayment,
    getUserTransactions
} = require("../controllers/payment.controller");

// @route   POST /api/payment/certificate/initialize
// @desc    Initialize certificate payment after passing exam
// @access  Private
router.post("/certificate/initialize", protect, initializeCertificatePayment);

// @route   GET /api/payment/certificate/verify/:reference
// @desc    Verify certificate payment after Paystack callback
// @access  Private
router.get("/certificate/verify/:reference", protect, verifyCertificatePayment);

// @route   GET /api/payment/transactions
// @desc    Get user transaction history
// @access  Private
router.get("/transactions", protect, getUserTransactions);

module.exports = router;