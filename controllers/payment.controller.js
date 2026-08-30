const https = require("https");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const { logActivity } = require("../utils/activityLog");
const Course = require("../models/Course");
const User = require("../models/User");
const ExamAttempt = require("../models/ExamAttempt");
const ReferralPartner = require("../models/ReferralPartner");
const ReferralSettings = require("../models/ReferralSettings");
const { getRegistrationAmountNGN, getCourseAmountNGN } = require("../utils/pricing");

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

// ── REFERRAL PAYOUT (Option B — separate Transfer call, decoupled from
// the main split-code charge) ──
// Called only at the moment a Payment first transitions to "success",
// from both verify* functions and the webhook. Snapshots the rate/tier
// on the Payment record regardless of outcome, so reporting is accurate
// even if the actual Transfer fails or is held pending.
//
// Rules enforced here:
//   - one-time tier: pays out ONLY on paymentType === "registration", once.
//   - lifetime tier: pays out on BOTH "registration" and "certificate"
//     (exam fee) payments, for as long as the partner stays active.
//   - inactive partner at time of this payment: amount is still snapshotted
//     for reporting, but recipient is "asodem" and no Transfer is attempted —
//     this is the deactivation redirect. No retroactive catch-up later.
const processReferralPayout = async (payment, user, paymentType) => {
    try {
        if (!user.referralPartnerId) return;

        const partner = await ReferralPartner.findById(user.referralPartnerId);
        if (!partner) return;

        // one-time tier never pays out on exam/certificate fees
        if (partner.tier === "one-time" && paymentType !== "registration") {
            return;
        }

        let payoutAmount = 0;
        if (partner.tier === "one-time") {
            const settings = await ReferralSettings.getSettings();
            payoutAmount = settings.individualFlatAmount || 0;
        } else {
            payoutAmount = paymentType === "registration"
                ? (partner.registrationFlatAmount || 0)
                : (partner.examFlatAmount || 0);
        }

        if (payoutAmount <= 0) return;

        payment.referralPartnerId = partner._id;
        payment.referralTier = partner.tier;
        payment.referralPayoutAmount = payoutAmount;

        if (partner.status !== "active") {
            payment.referralPayoutRecipient = "asodem";
            payment.referralPayoutStatus = "redirected_asodem";
            await payment.save();
            return;
        }

        payment.referralPayoutRecipient = "partner";

        if (!partner.paystackRecipientCode) {
            payment.referralPayoutStatus = "pending_subaccount";
            await payment.save();
            return;
        }

        try {
            const transferResponse = await paystackRequest("POST", "/transfer", {
                source: "balance",
                amount: payoutAmount,
                recipient: partner.paystackRecipientCode,
                reason: `ASODEM referral payout — ${paymentType} — ${payment.reference}`
            });

            if (transferResponse.status) {
                payment.referralPayoutStatus = "paid_to_partner";
            } else {
                console.error("Referral transfer failed:", transferResponse.message);
                payment.referralPayoutStatus = "transfer_failed";
            }
        } catch (transferError) {
            console.error("Referral transfer error:", transferError);
            payment.referralPayoutStatus = "transfer_failed";
        }

        await payment.save();

    } catch (error) {
        // Never let a referral payout issue affect the student's own
        // payment flow — this runs after their payment already succeeded.
        console.error("Referral payout processing error:", error);
    }
};

// ── INITIALIZE CERTIFICATE PAYMENT ──
// NOTE: this now runs BEFORE the exam attempt exists. It gates starting a
// certification attempt, not generating a certificate. One successful,
// unused payment = one exam sitting (consumed in exam.controller.startAttempt).
const initializeCertificatePayment = async (req, res) => {
    try {
        const { courseId } = req.body;
        const user = req.user;

        if (!courseId) {
            return res.status(400).json({ message: "Course ID is required" });
        }

        const course = await Course.findOne({ _id: courseId, isActive: true });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        const amountNGN = await getCourseAmountNGN(course.price);

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

        await logActivity({
            user: user._id, email: user.email, event: "certificate_payment_initialized",
            metadata: { courseId, courseTitle: course.title, amountNGN }, req
        });

        res.status(200).json({
            message: "Exam payment initialized",
            reference,
            amountNGN,
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

        const payment = await Payment.findOne({ reference, type: "certificate" });
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

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

        const metaUserId = transaction.metadata?.userId;
        if (metaUserId && metaUserId !== user._id.toString()) {
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
            });
        }

        if (transaction.metadata?.type && transaction.metadata.type !== "certificate") {
            return res.status(403).json({
                message: "This payment reference is not an exam-fee payment."
            });
        }

        if (transaction.status === "success") {
            payment.status = "success";
            payment.channel = transaction.channel;
            payment.paidAt = new Date(transaction.paid_at);
            await payment.save();

            await processReferralPayout(payment, user, "certificate");

            await logActivity({
                user: user._id, email: user.email, event: "certificate_payment_verified",
                metadata: { courseId: payment.course, amount: payment.amount }, req
            });

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

        const amountNGN = await getRegistrationAmountNGN();

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

        // Persist this as a Payment record so it shows up in admin
        // Transactions, same as exam/certificate payments already do.
        await Payment.create({
            user: user._id,
            course: null,
            examAttempt: null,
            type: "registration",
            reference,
            amount: amountKobo,
            currency: "NGN",
            status: "pending"
        });

        await logActivity({
            user: user._id, email: user.email, event: "registration_payment_initialized",
            metadata: { amountNGN }, req
        });

        res.status(200).json({
            message: "Registration payment initialized",
            reference,
            amountNGN,
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

        const alreadyUsed = await User.findOne({ registrationPaymentRef: reference });
        if (alreadyUsed) {
            return res.status(409).json({
                message: "This payment reference has already been used to activate an account."
            });
        }

        // Find the Payment record created at initialization time
        const payment = await Payment.findOne({ reference });
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

        if (payment.user.toString() !== user._id.toString()) {
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
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
            payment.status = "failed";
            await payment.save();

            return res.status(400).json({
                message: "Payment was not successful. Please try again.",
                status: transaction.status
            });
        }

        const metaUserId = transaction.metadata?.userId;
        if (!metaUserId || metaUserId !== user._id.toString()) {
            console.warn(
                `Registration payment ownership mismatch — reference ${reference} belongs to user ${metaUserId}, attempted by ${user._id}`
            );
            return res.status(403).json({
                message: "This payment reference does not belong to your account."
            });
        }

        if (transaction.metadata?.type !== "registration") {
            return res.status(403).json({
                message: "This payment reference is not a registration payment."
            });
        }

        payment.status = "success";
        payment.channel = transaction.channel;
        payment.paidAt = new Date(transaction.paid_at);
        await payment.save();

       await User.findByIdAndUpdate(user._id, {
            hasPaidRegistration: true,
            registrationPaymentRef: reference
        });

        await processReferralPayout(payment, user, "registration");

        await logActivity({
            user: user._id, email: user.email, event: "registration_payment_verified",
            metadata: { reference }, req
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

// ── DELETE SINGLE TRANSACTION (ADMIN) ──
const deleteTransaction = async (req, res) => {
    try {
        const payment = await Payment.findByIdAndDelete(req.params.id);

        if (!payment) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        res.status(200).json({ message: "Transaction deleted successfully" });

    } catch (error) {
        console.error("Delete transaction error:", error);
        res.status(500).json({ message: "Failed to delete transaction." });
    }
};

// ── BULK DELETE TRANSACTIONS (ADMIN) ──
const bulkDeleteTransactions = async (req, res) => {
    try {
        const { transactionIds } = req.body;

        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({ message: "No transaction IDs provided" });
        }

        const result = await Payment.deleteMany({ _id: { $in: transactionIds } });

        res.status(200).json({
            message: `${result.deletedCount} transaction${result.deletedCount !== 1 ? "s" : ""} deleted successfully`
        });

    } catch (error) {
        console.error("Bulk delete transactions error:", error);
        res.status(500).json({ message: "Failed to delete transactions." });
    }
};

// PAYSTACK WEBHOOK ──
// Server-authoritative confirmation, independent of the client ever
// calling /verify. Covers the case where a user pays (especially via
// async bank transfer) and never returns to the app — client-side verify
// alone would leave that Payment stuck at "pending" forever.
const paystackWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-paystack-signature"];

        if (!signature || !req.rawBody) {
            return res.status(400).send("Missing signature or body");
        }

        const expectedHash = crypto
            .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
            .update(req.rawBody)
            .digest("hex");

        if (expectedHash !== signature) {
            console.warn("Paystack webhook: signature mismatch, ignoring");
            return res.status(401).send("Invalid signature");
        }

        // Acknowledge immediately — Paystack retries aggressively on non-2xx.
        res.status(200).send("OK");

        const event = req.body;
        if (event.event !== "charge.success") return;

        const transaction = event.data;
        const reference = transaction.reference;

        const payment = await Payment.findOne({ reference });
        if (!payment) {
            console.warn(`Webhook: no Payment record for reference ${reference}`);
            return;
        }

        // Idempotent — if /verify already processed this, do nothing.
        if (payment.status === "success") return;

        const metaUserId = transaction.metadata?.userId;
        if (!metaUserId || metaUserId !== payment.user.toString()) {
            console.error(`Webhook: metadata.userId mismatch for reference ${reference}`);
            return;
        }

        if (transaction.metadata?.type && transaction.metadata.type !== payment.type) {
            console.error(`Webhook: metadata.type mismatch for reference ${reference}`);
            return;
        }

        payment.status = "success";
        payment.channel = transaction.channel;
        payment.paidAt = new Date(transaction.paid_at);
        await payment.save();

        if (payment.type === "registration") {
            const alreadyUsed = await User.findOne({
                registrationPaymentRef: reference,
                _id: { $ne: payment.user }
            });
            if (!alreadyUsed) {
                await User.findByIdAndUpdate(payment.user, {
                    hasPaidRegistration: true,
                    registrationPaymentRef: reference
                });
            }
        }

        const payingUser = await User.findById(payment.user);
        if (payingUser) {
            await processReferralPayout(payment, payingUser, payment.type === "registration" ? "registration" : "certificate");
        }

    } catch (error) {
        console.error("Paystack webhook error:", error);
        // Response already sent above; nothing more to do.
    }
};

module.exports = {
    initializeCertificatePayment,
    verifyCertificatePayment,
    initializeRegistrationPayment,
    verifyRegistrationPayment,
    getUserTransactions,
    getAllTransactions,
    deleteTransaction,
    bulkDeleteTransactions,
    paystackWebhook
};