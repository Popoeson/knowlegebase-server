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

// AI question generation — protects Groq quota/cost from a buggy retry
// loop or a compromised admin session running up calls.
const aiGenerateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many AI generation requests. Please wait a few minutes." },
    standardHeaders: true,
    legacyHeaders: false
});

// General moderate limiter — for endpoints that don't need the tight
// auth-style limits but shouldn't be fully unthrottled either
// (change-password, certificate generate/verify).
const moderateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Too many requests. Please slow down and try again shortly." },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { authLimiter, otpLimiter, paymentLimiter, aiGenerateLimiter, moderateLimiter };