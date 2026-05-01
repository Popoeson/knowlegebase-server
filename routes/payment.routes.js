const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
    initializePayment,
    verifyPayment,
    getUserTransactions
} = require("../controllers/payment.controller");

// @route   POST /api/payment/initialize
// @desc    Initialize Paystack payment
// @access  Private
router.post("/initialize", protect, initializePayment);

// @route   GET /api/payment/verify/:reference
// @desc    Verify payment after Paystack callback
// @access  Private
router.get("/verify/:reference", protect, verifyPayment);

// @route   GET /api/payment/transactions
// @desc    Get user transaction history
// @access  Private
router.get("/transactions", protect, getUserTransactions);

module.exports = router;