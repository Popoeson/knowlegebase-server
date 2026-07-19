const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { paymentLimiter, paymentVerifyLimiter } = require("../middleware/rateLimit.middleware");
const {
    initializeCertificatePayment,
    verifyCertificatePayment,
    getUserTransactions,
    paystackWebhook
} = require("../controllers/payment.controller");

router.post("/webhook", paystackWebhook);

router.post("/initialize", protect, paymentLimiter, initializeCertificatePayment);

router.get("/verify/:reference", protect, paymentVerifyLimiter, verifyCertificatePayment);

router.get("/transactions", protect, getUserTransactions);

module.exports = router;