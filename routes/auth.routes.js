const express = require("express");
const router = express.Router();
const {
    register,
    verifyOTP,
    resendOTP,
    login,
    forgotPassword,
    resetPassword
} = require("../controllers/auth.controller");

const { protectUnpaid } = require("../middleware/auth.middleware");

const {
    initializeRegistrationPayment,
    verifyRegistrationPayment
} = require("../controllers/payment.controller");

// @route   POST /api/auth/register
router.post("/register", register);

// @route   POST /api/auth/verify-otp
router.post("/verify-otp", verifyOTP);

// @route   POST /api/auth/resend-otp
router.post("/resend-otp", resendOTP);

// @route   POST /api/auth/login
router.post("/login", login);

// @route   POST /api/auth/forgot-password
router.post("/forgot-password", forgotPassword);

// @route   POST /api/auth/reset-password
router.post("/reset-password", resetPassword);

// @route   POST /api/auth/registration-payment/initialize
// @desc    Initialize $2 registration fee — token required, payment not yet required
// @access  Verified users only (protectUnpaid bypasses hasPaidRegistration check)
router.post("/registration-payment/initialize", protectUnpaid, initializeRegistrationPayment);

// @route   GET /api/auth/registration-payment/verify/:reference
router.get("/registration-payment/verify/:reference", protectUnpaid, verifyRegistrationPayment);

module.exports = router;