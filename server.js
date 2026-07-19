require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const Sentry = require("@sentry/node");
const connectDB = require("./config/db");

// ── BOOT-TIME ENV VALIDATION ──
// New Render services start with zero env vars. Fail loud at boot instead
// of limping along and surfacing 500s on real user requests later.
const REQUIRED_ENV_VARS = [
    "MONGO_URI",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_PUBLIC_KEY",
    "BREVO_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "CLIENT_URL",
    "GROQ_API_KEY",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
    "SENTRY_ORG_SLUG",
    "SENTRY_PROJECT_SLUG"
];

const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    console.error("FATAL: Missing required environment variables:");
    missingVars.forEach(key => console.error(`  - ${key}`));
    console.error("Server will not start until these are set.");
    process.exit(1);
}

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const courseRoutes = require("./routes/course.routes");
const adminRoutes = require("./routes/admin.routes");
const examRoutes = require("./routes/exam.routes");
const paymentRoutes = require("./routes/payment.routes");
const certificateRoutes = require("./routes/certificate.routes");
const errorMonitorRoutes = require("./routes/errorMonitor.routes");

const app = express();

// Must initialize before any other middleware so Sentry can capture
// errors from everything downstream, including request context (route,
// method, headers) attached automatically to each error.
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1 // captures 10% of requests for performance data, keeps free-tier quota healthy
});

connectDB();

app.use(helmet());

// Allowed origin(s) come entirely from the CLIENT_URL env var on each
// Render service — production and staging each set their own value, so
// this same code allows only the correct frontend on each deployment.
// Supports a comma-separated list in case staging ever needs to allow
// more than one frontend URL (e.g. both a bare .vercel.app domain and a
// git-branch preview URL).
const allowedOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map(url => url.trim())
    .filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error("CORS blocked origin:", origin);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));

// Capture raw body alongside parsed JSON so the Paystack webhook can
// verify the HMAC signature against the exact bytes Paystack sent —
// signature verification fails against a re-serialized JSON.parse() output.
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));

// Strips any request key starting with "$" or containing "." from
// req.body, req.query, and req.params before it reaches a controller —
// closes NoSQL operator-injection (e.g. ?courseId[$ne]=null) at the
// framework level instead of relying on every controller to type-check
// every field individually.
app.use(mongoSanitize());

app.get("/", (req, res) => {
    res.json({ message: "ASODEM API is running" });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/error-monitor", errorMonitorRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// Sentry's own error handler must be registered before your final custom
// one, so it captures the error first, then hands off to your existing
// response logic unchanged.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});