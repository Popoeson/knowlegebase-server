// Translates raw error titles/messages from Sentry into plain-English
// explanations with a suggested next step, tailored to this specific
// codebase. Matched by keyword patterns since exact error text varies
// (different IDs, different values) even for the "same" underlying issue.
// Falls through to a generic translation if nothing matches, so every
// error still shows something useful rather than raw stack trace text.

const PATTERNS = [
    {
        test: /paystack/i,
        title: "A payment-related request failed",
        explanation: "Your server tried to reach Paystack (to start, verify, or check a payment) and something went wrong. This is often temporary — Paystack having a slow moment — rather than a bug in your code.",
        suggestion: "Check Paystack's status page. If this keeps recurring, verify your PAYSTACK_SECRET_KEY is still valid and hasn't been rotated."
    },
    {
        test: /mongo|mongoose|ECONNREFUSED.*27017|buffering timed out/i,
        title: "A database request failed or timed out",
        explanation: "Your server couldn't complete a request to MongoDB Atlas in time. This can happen during a brief Atlas connectivity blip, or if the connection pool is under heavy load.",
        suggestion: "Check MongoDB Atlas's status dashboard. If this is happening often, it may be a sign you're approaching your connection limit — worth checking Atlas's connection metrics."
    },
    {
        test: /groq/i,
        title: "AI question generation failed",
        explanation: "The request to Groq (used for AI-generated exam questions) didn't complete successfully — this could be a quota limit, a temporary Groq outage, or an unexpected response format.",
        suggestion: "Check your Groq API usage/quota. If quota looks fine, this may just be a temporary Groq service issue — try again shortly."
    },
    {
        test: /cloudinary/i,
        title: "A file upload or image/PDF storage request failed",
        explanation: "Something went wrong uploading a file to Cloudinary (course thumbnail, profile photo, or certificate PDF). This is usually either a Cloudinary service hiccup or a malformed file.",
        suggestion: "Check Cloudinary's status page. If it's a specific file type failing repeatedly, the file itself may be the issue rather than the service."
    },
    {
        test: /brevo|smtp/i,
        title: "An email failed to send",
        explanation: "An OTP or notification email couldn't be delivered through Brevo. This could mean your Brevo API key has an issue, your account hit a sending limit, or the sender address lost verification.",
        suggestion: "Check your Brevo dashboard's email activity log for the specific failure reason, and confirm support@asodem.com is still verified as a sender."
    },
    {
        test: /jwt|jsonwebtoken|invalid signature|jwt expired/i,
        title: "A login session problem occurred",
        explanation: "Something went wrong verifying a user's login token. This is usually harmless — an expired session — but frequent occurrences could indicate a token-handling bug.",
        suggestion: "No action needed for occasional occurrences. If this spikes suddenly, check whether JWT_SECRET was recently changed (which would invalidate every existing session at once)."
    },
    {
        test: /E11000|duplicate key/i,
        title: "A duplicate record was rejected",
        explanation: "The database blocked an attempt to create a record that would have duplicated something meant to be unique (e.g. a payment reference, certificate, or email). In most cases this is your system correctly preventing a duplicate, not a real problem.",
        suggestion: "Usually safe to ignore unless a real user reports being unable to complete an action — then it's worth checking what specifically collided."
    },
    {
        test: /chromium|puppeteer/i,
        title: "Certificate PDF generation failed",
        explanation: "Puppeteer (which renders certificate PDFs) failed to launch or render correctly. This can happen if the server briefly ran low on memory during generation.",
        suggestion: "If this happens occasionally under normal load, it may resolve itself on retry. If it happens consistently, your Render instance may need more memory allocated."
    },
    {
        test: /rate limit|too many requests/i,
        title: "A rate limit was triggered",
        explanation: "Someone (or something) hit one of your rate limits — this is your protection working as intended, not a bug.",
        suggestion: "No action needed unless a legitimate user is reporting they're incorrectly blocked — then the specific limiter's threshold may need adjusting."
    }
];

const GENERIC = {
    title: "An unexpected error occurred",
    explanation: "This error didn't match any known pattern, so it may be something new or unusual worth a closer look.",
    suggestion: "Check the technical details below, or share them for a closer look if it's unclear."
};

const translateError = (rawTitle, rawMessage) => {
    const combined = `${rawTitle || ""} ${rawMessage || ""}`;
    const match = PATTERNS.find(p => p.test.test(combined));
    return match || GENERIC;
};

module.exports = { translateError };