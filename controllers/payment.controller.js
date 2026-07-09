const https = require("https");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const User = require("../models/User");
const ExamAttempt = require("../models/ExamAttempt");

// ── HELPER: CALL PAYSTACK API ──
const paystackRequest = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.paystack.co",
            port: 443,
            path,
            method,
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Failed to parse Paystack response"));
                }
            });
        });

        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

// ── INITIALIZE CERTIFICATE PAYMENT ──
// NOTE: this now runs BEFORE the exam attempt exists. It gates starting a
// certification attempt, not generating a certificate. One successful,
// unused payment = one exam sitting (consumed in exam.controller.startAttempt).
const initializeCertificatePayment = async (req, res) => {
    try {
        const { courseId, amountNGN } = req.body;
        const user = req.user;

        if (!courseId || !amountNGN) {
            return res.status(400).json({ message: "Course ID and amount are required" });
        }

        const course = await Course.findOne({ _id: courseId, isActive: true });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        // If the user already has a successful payment for this course that
        // hasn't been consumed by an attempt yet, don't charge them again —
        // they should just go start the exam.
        const existingUnusedPayment = await Payment.findOne({
            user: user._id,
            course: courseId,
            type: "certificate",
            status: "success",
            examAttempt: null
        });

        if (existingUnusedPayment) {
            return res.status(400).json({
                message: "You already have an unused payment for this course. You can start your exam.",
                code: "ALREADY_PAID"
            });
        }

        const amountKobo = Math.round(amountNGN * 100);
        const reference = `ASO-CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const paystackResponse = await paystackRequest("POST", "/transaction/initialize", {
            email: user.email,
            amount: amountKobo,
            reference,
            callback_url: `${process.env.CLIENT_URL}/pages/payment-callback.html`,
            split_code: process.env.PAYSTACK_SPLIT_CODE,
            metadata: {
                userId: user._id.toString(),
                courseId: courseId.toString(),
                courseTitle: course.title,
                fullName: user.fullName,
                type: "certificate"
            },
            channels: ["card", "bank", "ussd", "bank_transfer"]
        });

        if (!paystackResponse.status) {
            return res.status(400).json({
                message: paystackResponse.message || "Failed to initialize payment"
            });
        }

        await Payment.create({
            user: user._id,
            course: course._id,
            examAttempt: null,
            type: "certificate",
            reference,
            amount: amountKobo,
            currency: "NGN",
            status: "pending"
        });

        res.status(200).json({
            message: "Exam payment initialized",
            reference,
            accessCode: paystackResponse.data.access_code,
            authorizationUrl: paystackResponse.data.authorization_url
        });

    } catch (error) {
        console.error("Initialize certificate payment error:", error);
        res.status(500).json({ message: "Failed to initialize payment. Please try again." });
    }
};

// ── VERIFY CERTIFICATE PAYMENT ──
const verifyCertificatePayment = async (req, res) => {
    try {
        const { reference } = req.params;
        const user = req.user;

        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" });
        }

        const payment = await Payment.findOne({ reference });
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

        // Ownership check — this payment record must belong to the logged-in user
        if (payment.user.toString() !== user._id.toString()) {
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
            });
        }

        if (payment.status === "success") {
            return res.status(200).json({
                message: "Payment already verified",
                courseId: payment.course
            });
        }

        const paystackResponse = await paystackRequest(
            "GET",
            `/transaction/verify/${reference}`
        );

        if (!paystackResponse.status) {
            return res.status(400).json({
                message: paystackResponse.message || "Payment verification failed"
            });
        }

        const transaction = paystackResponse.data;

        // Cross-check Paystack's own metadata also agrees on ownership
        const metaUserId = transaction.metadata?.userId;
        if (metaUserId && metaUserId !== user._id.toString()) {
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
            });
        }

        if (transaction.status === "success") {
            payment.status = "success";
            payment.channel = transaction.channel;
            payment.paidAt = new Date(transaction.paid_at);
            await payment.save();

            return res.status(200).json({
                message: "Payment verified successfully",
                courseId: payment.course
            });
        } else {
            payment.status = "failed";
            await payment.save();

            return res.status(400).json({
                message: "Payment was not successful",
                status: transaction.status
            });
        }

    } catch (error) {
        console.error("Verify certificate payment error:", error);
        res.status(500).json({ message: "Failed to verify payment. Please try again." });
    }
};

// ── INITIALIZE REGISTRATION PAYMENT ──
const initializeRegistrationPayment = async (req, res) => {
    try {
        const user = req.user;

        if (user.hasPaidRegistration) {
            return res.status(400).json({
                message: "Registration fee already paid.",
                code: "ALREADY_PAID"
            });
        }

        const { amountNGN } = req.body;

        if (!amountNGN) {
            return res.status(400).json({ message: "Amount is required" });
        }

        const amountKobo = Math.round(amountNGN * 100);
        const reference = `ASO-REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const paystackResponse = await paystackRequest("POST", "/transaction/initialize", {
            email: user.email,
            amount: amountKobo,
            reference,
            callback_url: `${process.env.CLIENT_URL}/pages/registration-payment-callback.html`,
            split_code: process.env.PAYSTACK_SPLIT_CODE,
            metadata: {
                userId: user._id.toString(),
                fullName: user.fullName,
                type: "registration"
            },
            channels: ["card", "bank", "ussd", "bank_transfer"]
        });

        if (!paystackResponse.status) {
            return res.status(400).json({
                message: paystackResponse.message || "Failed to initialize payment"
            });
        }

        res.status(200).json({
            message: "Registration payment initialized",
            reference,
            accessCode: paystackResponse.data.access_code,
            authorizationUrl: paystackResponse.data.authorization_url
        });

    } catch (error) {
        console.error("Initialize registration payment error:", error);
        res.status(500).json({ message: "Failed to initialize payment. Please try again." });
    }
};

// ── VERIFY REGISTRATION PAYMENT ──
const verifyRegistrationPayment = async (req, res) => {
    try {
        const { reference } = req.params;
        const user = req.user;

        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" });
        }

        if (user.hasPaidRegistration) {
            return res.status(200).json({
                message: "Registration already paid.",
                code: "ALREADY_PAID"
            });
        }

        // Prevent reuse — if this reference already activated ANY account,
        // it cannot be reused, even by a different user
        const alreadyUsed = await User.findOne({ registrationPaymentRef: reference });
        if (alreadyUsed) {
            return res.status(409).json({
                message: "This payment reference has already been used to activate an account."
            });
        }

        const paystackResponse = await paystackRequest(
            "GET",
            `/transaction/verify/${reference}`
        );

        if (!paystackResponse.status) {
            return res.status(400).json({
                message: paystackResponse.message || "Verification failed"
            });
        }

        const transaction = paystackResponse.data;

        if (transaction.status !== "success") {
            return res.status(400).json({
                message: "Payment was not successful. Please try again.",
                status: transaction.status
            });
        }

        // Ownership check — reference must belong to the logged-in user
        const metaUserId = transaction.metadata?.userId;
        if (!metaUserId || metaUserId !== user._id.toString()) {
            console.warn(
                `Registration payment ownership mismatch — reference ${reference} belongs to user ${metaUserId}, attempted by ${user._id}`
            );
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
            });
        }

        // Type check — reject certificate/other payment types being replayed here
        if (transaction.metadata?.type !== "registration") {
            return res.status(403).json({
                message: "This payment reference is not a registration payment."
            });
        }

        await User.findByIdAndUpdate(user._id, {
            hasPaidRegistration: true,
            registrationPaymentRef: reference
        });

        return res.status(200).json({
            message: "Registration payment verified. Welcome to ASODEM!"
        });

    } catch (error) {
        console.error("Verify registration payment error:", error);
        res.status(500).json({ message: "Failed to verify payment. Please try again." });
    }
};

// ── GET USER TRANSACTIONS ──
const getUserTransactions = async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user._id })
            .populate("course", "title price")
            .populate("examAttempt", "score passed submittedAt")
            .sort({ createdAt: -1 });

        res.status(200).json({ payments });

    } catch (error) {
        console.error("Get transactions error:", error);
        res.status(500).json({ message: "Failed to get transactions." });
    }
};

// ── GET ALL TRANSACTIONS (ADMIN) ──
const getAllTransactions = async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate("user", "firstName otherName surname email")
            .populate("course", "title price")
            .populate("examAttempt", "score passed")
            .sort({ createdAt: -1 });

        const totalRevenue = payments
            .filter(p => p.status === "success")
            .reduce((sum, p) => sum + p.amount, 0);

        res.status(200).json({ payments, totalRevenue });

    } catch (error) {
        console.error("Get all transactions error:", error);
        res.status(500).json({ message: "Failed to get transactions." });
    }
};

module.exports = {
    initializeCertificatePayment,
    verifyCertificatePayment,
    initializeRegistrationPayment,
    verifyRegistrationPayment,
    getUserTransactions,
    getAllTransactions
};
