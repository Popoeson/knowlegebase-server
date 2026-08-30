const ReferralPartner = require("../models/ReferralPartner");
const ReferralSettings = require("../models/ReferralSettings");
const User = require("../models/User");
const Payment = require("../models/Payment");
const { logActivity } = require("../utils/activityLog");
const https = require("https");
const { sendEmail } = require("../utils/sendOTP");

// ── HELPER: CALL PAYSTACK API (mirrors payment.controller.js's helper —
// duplicated rather than shared to avoid introducing a cross-controller
// import for one small function; revisit if this pattern repeats again) ──
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

// ── HELPER: SUGGEST A REFERRAL CODE ──
// Derived from name, admin/user can still edit before saving.
const suggestReferralCode = (name) => {
    const base = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}${suffix}`;
};

// ── HELPER: NOTIFY ADMIN OF NEW SUBACCOUNT (self-serve creation) ──
// Uses the same Brevo HTTP API path as OTP/password-reset emails.
// NOTE: assumes utils/sendOTP.js exports a generic sendEmail-style helper —
// verify against the real file before relying on this; adjust the import/
// call shape if the actual export differs.
const notifyAdminOfSubaccount = async (partner, adminEmail) => {
    try {
        const { sendEmail } = require("../utils/sendOTP");
        if (typeof sendEmail !== "function") {
            console.warn("notifyAdminOfSubaccount: sendEmail helper not found in utils/sendOTP — skipping notification email, check logs instead.");
            return;
        }
        await sendEmail(
            adminEmail,
            `New referral subaccount created — ${partner.name}`,
            `<p>A new Paystack subaccount was just created for referral partner <strong>${partner.name}</strong> (${partner.tier} tier, code ${partner.referralCode}).</p>
             <p>Subaccount code: ${partner.paystackSubaccountCode}<br/>
             Recipient code: ${partner.paystackRecipientCode}</p>
             <p>Please verify this on the Paystack dashboard.</p>`
        );
    } catch (err) {
        // Never block the subaccount-creation flow over a notification failure
        console.error("Admin subaccount notification failed:", err);
    }
};

// ── SELF-SERVE: SIGN UP FOR AFFILIATION ──
// Opt-in only — a user is NOT a referral partner just by existing.
// Creates a one-time tier partner. Lifetime tier is admin-only (onboardInstitution below).
const signUpForAffiliation = async (req, res) => {
    try {
        const user = req.user;

        const existing = await ReferralPartner.findOne({ linkedUserId: user._id });
        if (existing) {
            return res.status(400).json({ message: "You are already registered as a referral partner.", referralCode: existing.referralCode });
        }

        const suggestedCode = suggestReferralCode(user.fullName);

        const partner = await ReferralPartner.create({
            linkedUserId: user._id,
            name: user.fullName,
            referralCode: suggestedCode,
            tier: "one-time",
            status: "active",
            onboardedBy: null
        });

        await logActivity({
            user: user._id, email: user.email, event: "referral_signup",
            metadata: { referralPartnerId: partner._id.toString(), referralCode: partner.referralCode }, req
        });

        res.status(201).json({
            message: "You're now a referral partner. Share your code to start earning.",
            referralCode: partner.referralCode
        });

    } catch (error) {
        console.error("Referral signup error:", error);
        if (error.code === 11000) {
            return res.status(409).json({ message: "That referral code is already taken. Please try again." });
        }
        res.status(500).json({ message: "Failed to sign up for affiliation." });
    }
};

// ── SELF-SERVE: GET MY REFERRAL INFO + STATS ──
const getMyReferralInfo = async (req, res) => {
    try {
        const partner = await ReferralPartner.findOne({ linkedUserId: req.user._id });
        if (!partner) {
            return res.status(404).json({ message: "You are not registered as a referral partner yet." });
        }

        const referredCount = await User.countDocuments({ referralPartnerId: partner._id });

        const payoutAgg = await Payment.aggregate([
            { $match: { referralPartnerId: partner._id, status: "success" } },
            { $group: {
                _id: "$referralPayoutStatus",
                total: { $sum: "$referralPayoutAmount" },
                count: { $sum: 1 }
            } }
        ]);

        res.status(200).json({
            partner: {
                name: partner.name,
                referralCode: partner.referralCode,
                tier: partner.tier,
                status: partner.status,
                hasSubaccount: !!partner.paystackRecipientCode
            },
            referredStudentCount: referredCount,
            payoutBreakdown: payoutAgg
        });

    } catch (error) {
        console.error("Get my referral info error:", error);
        res.status(500).json({ message: "Failed to get referral info." });
    }
};

// ── HELPER: NOTIFY ADMIN OF NEW PAYOUT RECIPIENT (self-serve creation) ──
// Uses the same Brevo HTTP API path as OTP/password-reset emails.
const notifyAdminOfSubaccount = async (partner, adminEmail) => {
    try {
        await sendEmail(
            adminEmail,
            "ASODEM Admin",
            `New referral subaccount created — ${partner.name}`,
            `<p>A new Paystack payout recipient was just set up for referral partner <strong>${partner.name}</strong> (${partner.tier} tier, code ${partner.referralCode}).</p>
             <p>Recipient code: ${partner.paystackRecipientCode}<br/>
             Bank: ${partner.bankDetails?.accountName || "n/a"} — ${partner.bankDetails?.accountNumber || "n/a"}</p>
             <p>Please verify this on the Paystack dashboard.</p>`
        );
    } catch (err) {
        // Never block the subaccount-creation flow over a notification failure
        console.error("Admin subaccount notification failed:", err);
    }
};

// ── SELF-SERVE: SUBMIT BANK DETAILS → CREATE PAYSTACK RECIPIENT ──
// Any partner (institution or individual) does this once. Triggers the
// admin notification requested for manual verification on Paystack's side.
const setupPayoutAccount = async (req, res) => {
    try {
        const { bankCode, accountNumber } = req.body;

        if (!bankCode || !accountNumber) {
            return res.status(400).json({ message: "Bank code and account number are required." });
        }

        const partner = await ReferralPartner.findOne({ linkedUserId: req.user._id });
        if (!partner) {
            return res.status(404).json({ message: "You are not registered as a referral partner." });
        }

        // Resolve account name via Paystack before creating the recipient,
        // so the admin notification includes a human-readable name to check.
        const resolveResponse = await paystackRequest(
            "GET",
            `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
        );

        if (!resolveResponse.status) {
            return res.status(400).json({ message: resolveResponse.message || "Could not verify bank account." });
        }

        const accountName = resolveResponse.data.account_name;

        const recipientResponse = await paystackRequest("POST", "/transferrecipient", {
            type: "nuban",
            name: accountName,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: "NGN"
        });

        if (!recipientResponse.status) {
            return res.status(400).json({ message: recipientResponse.message || "Failed to create payout recipient." });
        }

        partner.bankDetails = { bankCode, accountNumber, accountName };
        partner.paystackRecipientCode = recipientResponse.data.recipient_code;
        // subaccountDeletedAt cleared in case this partner previously had one
        // removed by admin and is now re-setting up.
        partner.subaccountDeletedAt = null;
        await partner.save();

        // Notify admin — required so every new subaccount gets a manual
        // check on Paystack's own dashboard, per project policy.
        if (process.env.ADMIN_NOTIFICATION_EMAIL) {
            await notifyAdminOfSubaccount(partner, process.env.ADMIN_NOTIFICATION_EMAIL);
        } else {
            console.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping admin subaccount notification email.");
        }

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_payout_account_set",
            metadata: { referralPartnerId: partner._id.toString(), accountName }, req
        });

        res.status(200).json({
            message: "Payout account set up successfully. Any pending payouts will now be processed.",
            accountName
        });

    } catch (error) {
        console.error("Setup payout account error:", error);
        res.status(500).json({ message: "Failed to set up payout account." });
    }
};

// ── ADMIN: ONBOARD INSTITUTION / UPGRADE INDIVIDUAL TO LIFETIME TIER ──
const onboardPartner = async (req, res) => {
    try {
        const { userId, name, tier, tag, registrationFlatAmount, examFlatAmount, referralCode } = req.body;

        if (!userId || !name || !tier) {
            return res.status(400).json({ message: "userId, name, and tier are required." });
        }

        if (!["one-time", "lifetime"].includes(tier)) {
            return res.status(400).json({ message: "tier must be 'one-time' or 'lifetime'." });
        }

        if (tier === "lifetime" && !tag) {
            return res.status(400).json({ message: "A tag ('institution_as_institution' or 'individual_as_institution') is required for lifetime-tier partners." });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found." });
        }

        const existing = await ReferralPartner.findOne({ linkedUserId: userId });
        if (existing) {
            return res.status(400).json({ message: "This user is already a referral partner. Use the edit endpoint to change their terms." });
        }

        const code = referralCode
            ? referralCode.trim().toUpperCase()
            : suggestReferralCode(name);

        const partner = await ReferralPartner.create({
            linkedUserId: userId,
            name,
            referralCode: code,
            tier,
            tag: tier === "lifetime" ? tag : null,
            registrationFlatAmount: tier === "lifetime" ? (registrationFlatAmount || 0) : null,
            examFlatAmount: tier === "lifetime" ? (examFlatAmount || 0) : null,
            status: "active",
            onboardedBy: req.user._id
        });

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_partner_onboarded",
            metadata: { referralPartnerId: partner._id.toString(), tier, tag: partner.tag }, req
        });

        res.status(201).json({ message: "Partner onboarded successfully.", partner });

    } catch (error) {
        console.error("Onboard partner error:", error);
        if (error.code === 11000) {
            return res.status(409).json({ message: "That referral code is already taken." });
        }
        res.status(500).json({ message: "Failed to onboard partner." });
    }
};

// ── ADMIN: GET ALL PARTNERS ──
const getAllPartners = async (req, res) => {
    try {
        const partners = await ReferralPartner.find()
            .populate("linkedUserId", "firstName otherName surname email")
            .populate("onboardedBy", "firstName surname email")
            .sort({ createdAt: -1 });

        res.status(200).json({ partners });
    } catch (error) {
        console.error("Get all partners error:", error);
        res.status(500).json({ message: "Failed to get partners." });
    }
};

// ── ADMIN: EDIT PARTNER TERMS ──
const editPartner = async (req, res) => {
    try {
        const partner = await ReferralPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: "Partner not found." });

        const { name, referralCode, registrationFlatAmount, examFlatAmount, tag } = req.body;

        if (name) partner.name = name;
        if (referralCode) partner.referralCode = referralCode.trim().toUpperCase();
        if (partner.tier === "lifetime") {
            if (registrationFlatAmount !== undefined) partner.registrationFlatAmount = registrationFlatAmount;
            if (examFlatAmount !== undefined) partner.examFlatAmount = examFlatAmount;
            if (tag) partner.tag = tag;
        }

        await partner.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_partner_edited",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({ message: "Partner updated successfully.", partner });

    } catch (error) {
        console.error("Edit partner error:", error);
        if (error.code === 11000) {
            return res.status(409).json({ message: "That referral code is already taken." });
        }
        res.status(500).json({ message: "Failed to update partner." });
    }
};

// ── ADMIN: ACTIVATE / DEACTIVATE PARTNER ──
// Deactivation redirects future payouts to ASODEM (handled in
// payment.controller.js's processReferralPayout) without touching
// attribution — referred students stay tied to this partner either way.
const togglePartnerStatus = async (req, res) => {
    try {
        const partner = await ReferralPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: "Partner not found." });

        partner.status = partner.status === "active" ? "inactive" : "active";
        await partner.save();

        await logActivity({
            user: req.user._id, email: req.user.email,
            event: partner.status === "active" ? "referral_partner_activated" : "referral_partner_deactivated",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({
            message: `Partner ${partner.status === "active" ? "activated" : "deactivated"} successfully.`,
            status: partner.status
        });

    } catch (error) {
        console.error("Toggle partner status error:", error);
        res.status(500).json({ message: "Failed to update partner status." });
    }
};

// ── ADMIN: MANUALLY REASSIGN A STUDENT'S PARTNER (edge-case override) ──
const reassignStudentPartner = async (req, res) => {
    try {
        const { referralPartnerId } = req.body; // null allowed, to clear attribution

        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found." });

        if (referralPartnerId) {
            const partner = await ReferralPartner.findById(referralPartnerId);
            if (!partner) return res.status(404).json({ message: "Referral partner not found." });
            targetUser.referralPartnerId = partner._id;
            targetUser.referralCodeUsed = partner.referralCode;
        } else {
            targetUser.referralPartnerId = null;
            targetUser.referralCodeUsed = null;
        }

        await targetUser.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_attribution_manual_override",
            metadata: { targetUserId: targetUser._id.toString(), newReferralPartnerId: referralPartnerId || null }, req
        });

        res.status(200).json({ message: "Student attribution updated successfully." });

    } catch (error) {
        console.error("Reassign student partner error:", error);
        res.status(500).json({ message: "Failed to reassign student." });
    }
};

// ── ADMIN: SETTLEMENT REPORT FOR A PARTNER ──
const getPartnerSettlement = async (req, res) => {
    try {
        const { start, end } = req.query;
        const partner = await ReferralPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: "Partner not found." });

        const dateFilter = {};
        if (start) dateFilter.$gte = new Date(start);
        if (end) dateFilter.$lte = new Date(end);

        const matchStage = {
            referralPartnerId: partner._id,
            status: "success"
        };
        if (start || end) matchStage.paidAt = dateFilter;

        const payments = await Payment.find(matchStage)
            .populate("user", "firstName otherName surname email")
            .sort({ paidAt: -1 });

        const referredStudentCount = await User.countDocuments({ referralPartnerId: partner._id });

        const totalTransactionVolume = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalOwed = payments
            .filter(p => p.referralPayoutRecipient === "partner")
            .reduce((sum, p) => sum + p.referralPayoutAmount, 0);
        const totalRedirectedToAsodem = payments
            .filter(p => p.referralPayoutRecipient === "asodem")
            .reduce((sum, p) => sum + p.referralPayoutAmount, 0);

        res.status(200).json({
            partner: { name: partner.name, referralCode: partner.referralCode, tier: partner.tier, status: partner.status },
            dateRange: { start: start || null, end: end || null },
            referredStudentCount,
            transactionCount: payments.length,
            totalTransactionVolume,
            totalOwed,
            totalRedirectedToAsodem,
            payments
        });

    } catch (error) {
        console.error("Get partner settlement error:", error);
        res.status(500).json({ message: "Failed to generate settlement report." });
    }
};

// ── ADMIN: GLOBAL REFERRAL SETTINGS ──
const getReferralSettings = async (req, res) => {
    try {
        const settings = await ReferralSettings.getSettings();
        res.status(200).json({ settings });
    } catch (error) {
        console.error("Get referral settings error:", error);
        res.status(500).json({ message: "Failed to get settings." });
    }
};

const updateReferralSettings = async (req, res) => {
    try {
        const { individualFlatAmount } = req.body;
        if (individualFlatAmount === undefined || individualFlatAmount < 0) {
            return res.status(400).json({ message: "A valid individualFlatAmount is required." });
        }

        const settings = await ReferralSettings.getSettings();
        settings.individualFlatAmount = individualFlatAmount;
        settings.updatedBy = req.user._id;
        await settings.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_settings_updated",
            metadata: { individualFlatAmount }, req
        });

        res.status(200).json({ message: "Settings updated successfully.", settings });

    } catch (error) {
        console.error("Update referral settings error:", error);
        res.status(500).json({ message: "Failed to update settings." });
    }
};

// ── ADMIN: LIST ALL SUBACCOUNTS/RECIPIENTS (for pruning) ──
const getAllSubaccounts = async (req, res) => {
    try {
        const partners = await ReferralPartner.find({ paystackRecipientCode: { $ne: null } })
            .populate("linkedUserId", "firstName surname email")
            .select("name referralCode tier paystackRecipientCode bankDetails subaccountDeletedAt")
            .sort({ createdAt: -1 });

        res.status(200).json({ partners });
    } catch (error) {
        console.error("Get all subaccounts error:", error);
        res.status(500).json({ message: "Failed to get subaccounts." });
    }
};

// ── ADMIN: DELETE A SUBACCOUNT (recipient) ──
// Does not delete the ReferralPartner record itself — just clears the
// payout-recipient link. Info is retained per the 30-day rule (see
// ReferralPartner model) and lazily cleared on next read after that.
const deleteSubaccount = async (req, res) => {
    try {
        const partner = await ReferralPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: "Partner not found." });

        partner.paystackRecipientCode = null;
        partner.subaccountDeletedAt = new Date();
        await partner.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_subaccount_deleted",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({ message: "Subaccount removed. Bank details retained for 30 days in case of reversal." });

    } catch (error) {
        console.error("Delete subaccount error:", error);
        res.status(500).json({ message: "Failed to delete subaccount." });
    }
};

module.exports = {
    signUpForAffiliation,
    getMyReferralInfo,
    setupPayoutAccount,
    onboardPartner,
    getAllPartners,
    editPartner,
    togglePartnerStatus,
    reassignStudentPartner,
    getPartnerSettlement,
    getReferralSettings,
    updateReferralSettings,
    getAllSubaccounts,
    deleteSubaccount
};