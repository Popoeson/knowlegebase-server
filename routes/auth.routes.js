const express = require("express");
const router = express.Router();
const {
    register,
    verifyOTP,
    resendOTP,
    login,
    forgotPassword,
    resetPassword,
    me
} = require("../controllers/auth.controller");

const { protectUnpaid } = require("../middleware/auth.middleware");
const {
    authLimiter,
    otpLimiter,
    paymentLimiter,
    loginAccountLimiter,
    paymentVerifyLimiter
} = require("../middleware/rateLimit.middleware");

const {
    initializeRegistrationPayment,
    verifyRegistrationPayment
} = require("../controllers/payment.controller");

router.post("/register", authLimiter, register);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/resend-otp", otpLimiter, resendOTP);
router.post("/login", authLimiter, loginAccountLimiter, login);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

router.get("/me", protectUnpaid, me);

router.post("/registration-payment/initialize", protectUnpaid, paymentLimiter, initializeRegistrationPayment);
router.get("/registration-payment/verify/:reference", protectUnpaid, paymentVerifyLimiter, verifyRegistrationPayment);

module.exports = router;