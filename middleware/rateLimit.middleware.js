const rateLimit = require("express-rate-limit");

// Tight limiter for auth endpoints prone to brute-force/spam
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 8,
    message: { message: "Too many attempts. Please try again in a few minutes." },
    standardHeaders: true,
    legacyHeaders: false
});

// Looser limiter for OTP resend — abusable for email-bombing a target inbox
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 3,
    message: { message: "Too many OTP requests. Please wait before requesting another." },
    standardHeaders: true,
    legacyHeaders: false
});

// General limiter for payment initialization — protects Paystack API quota
// and the exchange-rate fetch from being hammered
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { message: "Too many payment attempts. Please try again shortly." },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { authLimiter, otpLimiter, paymentLimiter };