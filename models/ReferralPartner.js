const mongoose = require("mongoose");

const referralPartnerSchema = new mongoose.Schema(
    {
        linkedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true
        },
        referralCode: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        tier: {
            type: String,
            enum: ["one-time", "lifetime"],
            required: true
        },
        tag: {
            type: String,
            enum: [null, "institution_as_institution", "individual_as_institution"],
            default: null
        },
        // Lifetime-tier only — negotiated per partner. Ignored for one-time
        // tier partners, who instead draw from the global ReferralSettings
        // individualFlatAmount at payout time.
        registrationFlatAmount: {
            type: Number,
            default: null
        },
        examFlatAmount: {
            type: Number,
            default: null
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },
        paystackSubaccountCode: {
            type: String,
            default: null
        },
        paystackRecipientCode: {
            type: String,
            default: null
        },
        bankDetails: {
            bankCode: { type: String, default: null },
            accountNumber: { type: String, default: null },
            accountName: { type: String, default: null }
        },
        // Lazy 30-day clear pattern (same approach as utils/cache.js TTL) —
        // checked and cleared on read in the controller, no cron job needed.
        subaccountDeletedAt: {
            type: Date,
            default: null
        },
        onboardedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null // null = self-serve individual signup, not admin-onboarded
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("ReferralPartner", referralPartnerSchema);