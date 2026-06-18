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
const initializeCertificatePayment = async (req, res) => {
    try {
        const { attemptId, amountNGN } = req.body;
        const user = req.user;

        if (!attemptId || !amountNGN) {
            return res.status(400).json({ message: "Attempt ID and amount are required" });
        }

        // Verify the attempt belongs to this user, is certification, and passed
        const attempt = await ExamAttempt.findOne({
            _id: attemptId,
            user: user._id,
            type: "certification",
            passed: true,
            status: { $in: ["submitted", "timed-out"] }
        }).populate("course", "title price");

        if (!attempt) {
            return res.status(404).json({
                message: "No passing certification attempt found"
            });
        }

        // Check if certificate payment already made for this attempt
        const existingPayment = await Payment.findOne({
            examAttempt: attemptId,
            user: user._id,
            type: "certificate",
            status: "success"
        });

        if (existingPayment) {
            return res.status(400).json({
                message: "Certificate payment already made for this attempt.",
                code: "ALREADY_PAID"
            });
        }

        const amountKobo = Math.round(amountNGN * 100);
        const reference = `TCI-CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const paystackResponse = await paystackRequest("POST", "/transaction/initialize", {
            email: user.email,
            amount: amountKobo,
            reference,
            callback_url: `${process.env.CLIENT_URL}/pages/payment-callback.html`,
            metadata: {
                userId: user._id.toString(),
                attemptId: attemptId.toString(),
                courseTitle: attempt.course.title,
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

        // Save pending payment record
        await Payment.create({
            user: user._id,
            course: attempt.course._id,
            examAttempt: attemptId,
            type: "certificate",
            reference,
            amount: amountKobo,
            currency: "NGN",
            status: "pending"
        });

        res.status(200).json({
            message: "Certificate payment initialized",
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

        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" });
        }

        const payment = await Payment.findOne({ reference });
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

        // Already verified
        if (payment.status === "success") {
            return res.status(200).json({
                message: "Payment already verified",
                attemptId: payment.examAttempt
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

        if (transaction.status === "success") {
            payment.status = "success";
            payment.channel = transaction.channel;
            payment.paidAt = new Date(transaction.paid_at);
            await payment.save();

            return res.status(200).json({
                message: "Payment verified successfully",
                attemptId: payment.examAttempt
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
        const reference = `TCI-REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const paystackResponse = await paystackRequest("POST", "/transaction/initialize", {
            email: user.email,
            amount: amountKobo,
            reference,
            callback_url: `${process.env.CLIENT_URL}/pages/registration-payment-callback.html`,
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

        if (transaction.status === "success") {
            await User.findByIdAndUpdate(user._id, {
                hasPaidRegistration: true,
                registrationPaymentRef: reference
            });

            return res.status(200).json({
                message: "Registration payment verified. Welcome to TECH COMPETENCE INSTITUTE!"
            });
        } else {
            return res.status(400).json({
                message: "Payment was not successful. Please try again.",
                status: transaction.status
            });
        }

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