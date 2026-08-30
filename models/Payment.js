const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            default: null
        },
        examAttempt: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExamAttempt",
            default: null
        },
        type: {
            type: String,
            enum: ["registration", "certificate"],
            default: "certificate"
        },
        reference: {
            type: String,
            required: true,
            unique: true
        },
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: "NGN"
        },
        status: {
            type: String,
            enum: ["pending", "success", "failed"],
            default: "pending"
        },
        channel: {
            type: String,
            default: null
        },
        paidAt: {
            type: Date,
            default: null
        },
        // Referral payout fields — all snapshotted at verify-time, never
        // recalculated later even if the partner's rate or status changes.
        referralPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ReferralPartner",
            default: null
        },
        referralTier: {
            type: String,
            enum: [null, "one-time", "lifetime"],
            default: null
        },
        referralPayoutAmount: {
            type: Number,
            default: 0
        },
        referralPayoutRecipient: {
            type: String,
            enum: [null, "partner", "asodem"],
            default: null
        },
        referralPayoutStatus: {
            type: String,
            enum: ["not_applicable", "paid_to_partner", "pending_subaccount", "redirected_asodem", "transfer_failed"],
            default: "not_applicable"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);