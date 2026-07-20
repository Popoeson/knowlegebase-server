require("./instrument");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const Sentry = require("@sentry/node");
const connectDB = require("./config/db");

// ── BOOT-TIME ENV VALIDATION ──
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
const activityRoutes = require("./routes/activity.routes");

const app = express();

connectDB();

app.use(helmet());

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

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/activity", activityRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});