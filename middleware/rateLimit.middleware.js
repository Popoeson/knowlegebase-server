const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: { message: "Too many attempts. Please try again in a few minutes." },
    standardHeaders: true,
    legacyHeaders: false
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: { message: "Too many OTP requests. Please wait before requesting another." },
    standardHeaders: true,
    legacyHeaders: false
});

const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { message: "Too many payment attempts. Please try again shortly." },
    standardHeaders: true,
    legacyHeaders: false
});

const aiGenerateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many AI generation requests. Please wait a few minutes." },
    standardHeaders: true,
    legacyHeaders: false
});

const moderateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Too many requests. Please slow down and try again shortly." },
    standardHeaders: true,
    legacyHeaders: false
});

// Secondary layer on top of authLimiter's IP-based limit. Closes a gap
// where an attacker distributes login guesses across many IPs (botnet /
// proxy pool) to dodge the per-IP cap entirely — this instead caps
// attempts against a single targeted ACCOUNT regardless of source IP.
// Deliberately looser than authLimiter (10/hour, not 8/15min) so a
// legitimate user mistyping their password a few times is never blocked —
// this is a safety net for distributed credential-stuffing bursts, not a
// replacement for the IP-based limiter.
const loginAccountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        const email = req.body?.email;
        return typeof email === "string" ? email.trim().toLowerCase() : req.ip;
    },
    message: { message: "Too many login attempts for this account. Please try again later or reset your password." },
    standardHeaders: true,
    legacyHeaders: false
});

// Protects outbound Paystack API quota — verify endpoints call Paystack
// directly on every request while a payment is still pending, so an
// uncapped retry loop (buggy frontend or deliberate abuse) spams Paystack
// through your server, not just your own database.
const paymentVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Too many payment verification attempts. Please wait a moment." },
    standardHeaders: true,
    legacyHeaders: false
});

// Applies broadly across all admin routes — caps how much damage a
// stolen/leaked admin token can do per window (bulk deletes, course/
// category writes, etc.) without getting in the way of legitimate admin
// work like uploading many questions in one session.
const adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many admin actions in a short period. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false
});

// For /exam/start and /exam/submit — once-per-attempt actions, so a low
// ceiling is appropriate.
const examActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Too many exam actions in a short period. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false
});

// For /exam/save-answer — fires on every answer selection during a real
// exam, so this needs real headroom. 300/15min (~20/min) comfortably
// covers legitimate autosave traffic across a long exam while still
// capping a scripted flood.
const examAutosaveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { message: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    authLimiter,
    otpLimiter,
    paymentLimiter,
    aiGenerateLimiter,
    moderateLimiter,
    loginAccountLimiter,
    paymentVerifyLimiter,
    adminActionLimiter,
    examActionLimiter,
    examAutosaveLimiter
};