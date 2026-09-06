const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        // Kept alongside `user` so events tied to an email that never
        // resolved to an account (e.g. a login attempt on a non-existent
        // address) are still searchable/traceable.
        email: {
            type: String,
            default: null
        },
        event: {
            type: String,
            required: true,
            enum: [
                "user_registered",
                "registration_payment_initialized",
                "registration_payment_verified",
                "login_success",
                "login_failed",
                "password_changed",
                "password_reset_requested",
                "password_reset_completed",
                "otp_resent",
                "exam_started",
                "exam_passed",
                "exam_failed",
                "exam_timed_out",
                "certificate_generated",
                "certificate_payment_initialized",
                "certificate_payment_verified",
                // Referral system events (added during referral program build)
                "referral_attribution_set",
                "referral_signup",
                "referral_payout_account_set",
                "referral_payout_account_edited",
                "referral_opted_out",
                "referral_opted_back_in",
                "referral_partner_onboarded",
                "referral_partner_edited",
                "referral_partner_activated",
                "referral_partner_deactivated",
                "referral_payout_override_granted",
                "referral_attribution_manual_override",
                "referral_settings_updated",
                "referral_subaccount_deleted",
                "referral_pending_payout_claimed"
            ]
            
        },
        // Free-form context specific to each event type — e.g. courseId/
        // courseTitle for exam events, amount/type for payment events.
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        ip: {
            type: String,
            default: null
        }
    },
    { timestamps: true }
);

// Serves the per-user timeline lookup and the general feed, both sorted
// by most recent first.
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ event: 1, createdAt: -1 });
activityLogSchema.index({ email: 1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);