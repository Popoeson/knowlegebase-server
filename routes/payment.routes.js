const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { paymentLimiter } = require("../middleware/rateLimit.middleware");
const {
    initializeCertificatePayment,
    verifyCertificatePayment,
    getUserTransactions,
    paystackWebhook
} = require("../controllers/payment.controller");

// @route   POST /api/payment/webhook
// @desc    Server-authoritative Paystack event confirmation (charge.success)
// @access  Public — protected by HMAC signature verification, not JWT
router.post("/webhook", paystackWebhook);

// @route   POST /api/payment/initialize
// @desc    Initialize exam payment (required before starting a certification attempt)
// @access  Private
router.post("/initialize", protect, paymentLimiter, initializeCertificatePayment);

// @route   GET /api/payment/verify/:reference
// @desc    Verify exam payment after Paystack callback
// @access  Private
router.get("/verify/:reference", protect, verifyCertificatePayment);

// @route   GET /api/payment/transactions
// @desc    Get user transaction history
// @access  Private
router.get("/transactions", protect, getUserTransactions);

module.exports = router;