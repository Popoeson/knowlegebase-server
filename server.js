require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const courseRoutes = require("./routes/course.routes");
const adminRoutes = require("./routes/admin.routes");
const examRoutes = require("./routes/exam.routes");
const paymentRoutes = require("./routes/payment.routes");
const certificateRoutes = require("./routes/certificate.routes");

const app = express();

connectDB();

app.use(cors({
    origin: function(origin, callback) {
        const allowed = [
    "https://knowlegebase-client.vercel.app",
    "https://www.asodem.com",
    process.env.CLIENT_URL
].filter(Boolean);

        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            console.error("CORS blocked origin:", origin);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.json({ message: "KNOWLEDGEBASE API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/certificates", certificateRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});