const https = require("https");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const User = require("../models/User");

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

// ── INITIALIZE COURSE PAYMENT ──
const initializePayment = async (req, res) => {
    try {
        const { courseId, amountNGN } = req.body;
        const user = req.user;

        if (!courseId || !amountNGN) {
            return res.status(400).json({ message: "Course and amount are required" });
        }

        const course = await Course.findOne({ _id: courseId, isActive: true });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        const amountKobo = Math.round(amountNGN * 100);
        const reference = `KB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const paystackResponse = await paystackRequest("POST", "/transaction/initialize", {
    email: user.email,
    amount: amountKobo,
    reference,
    callback_url: `${process.env.CLIENT_URL}/pages/payment-callback.html`,
    metadata: {
        userId: user._id.toString(),
        courseId: course._id.toString(),
        courseTitle: course.title,
        fullName: user.fullName
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
            course: courseId,
            reference,
            amount: amountKobo,
            currency: "NGN",
            status: "pending"
        });

        res.status(200).json({
            message: "Payment initialized",
            reference,
            accessCode: paystackResponse.data.access_code,
            authorizationUrl: paystackResponse.data.authorization_url
        });

    } catch (error) {
        console.error("Initialize payment error:", error);
        res.status(500).json({ message: "Failed to initialize payment. Please try again." });
    }
};

// ── VERIFY COURSE PAYMENT ──
const verifyPayment = async (req, res) => {
    try {
        const { reference } = req.params;

        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" });
        }

        const payment = await Payment.findOne({ reference });
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

        if (payment.status === "success") {
            return res.status(200).json({
                message: "Payment already verified",
                payment,
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

        if (transaction.status === "success") {
            payment.status = "success";
            payment.channel = transaction.channel;
            payment.paidAt = new Date(transaction.paid_at);
            await payment.save();

            return res.status(200).json({
                message: "Payment verified successfully",
                payment,
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
        console.error("Verify payment error:", error);
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
        const reference = `KB-REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

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

        // Already paid
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
            // Mark user as registration-paid
            await User.findByIdAndUpdate(user._id, {
                hasPaidRegistration: true,
                registrationPaymentRef: reference
            });

            return res.status(200).json({
                message: "Registration payment verified. Welcome to KNOWLEDGEBASE!"
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
    initializePayment,
    verifyPayment,
    initializeRegistrationPayment,
    verifyRegistrationPayment,
    getUserTransactions,
    getAllTransactions
};