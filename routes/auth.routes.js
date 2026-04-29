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

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post("/register", register);

// @route   POST /api/auth/verify-otp
// @desc    Verify email OTP
// @access  Public
router.post("/verify-otp", verifyOTP);

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP
// @access  Public
router.post("/resend-otp", resendOTP);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", login);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP
// @access  Public
router.post("/forgot-password", forgotPassword);

// @route   POST /api/auth/reset-password
// @desc    Reset password with OTP
// @access  Public
router.post("/reset-password", resetPassword);

module.exports = router;