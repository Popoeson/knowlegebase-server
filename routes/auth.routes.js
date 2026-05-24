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

const { protect, protectUnpaid } = require("../middleware/auth.middleware");

const {
    initializeRegistrationPayment,
    verifyRegistrationPayment
} = require("../controllers/payment.controller");

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// @route   GET /api/auth/me
// @desc    Restore session from persisted token — used by new tabs
// @access  Token required (protectUnpaid so unpaid users can still restore)
router.get("/me", protectUnpaid, me);

// Registration payment
router.post("/registration-payment/initialize", protectUnpaid, initializeRegistrationPayment);
router.get("/registration-payment/verify/:reference", protectUnpaid, verifyRegistrationPayment);

module.exports = router;