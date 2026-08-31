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

// ── HELPER: LAZY 30-DAY CLEAR ──
// Same lazy-TTL pattern as utils/cache.js — no cron job needed. Any read
// path that fetches a ReferralPartner should run its result(s) through
// this first. If a subaccount was deleted more than 30 days ago, the
// retained bank/recipient info is wiped for good at that point.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const clearExpiredSubaccountInfo = async (partner) => {
    if (!partner.subaccountDeletedAt) return partner;

    const expired = (Date.now() - partner.subaccountDeletedAt.getTime()) > THIRTY_DAYS_MS;
    if (!expired) return partner;

    partner.bankDetails = { bankCode: null, accountNumber: null, accountName: null };
    partner.subaccountDeletedAt = null;
    await partner.save();
    return partner;
};

// Batch version for list endpoints — runs the single-partner check across
// an array without blocking the response on partners that don't need it.
const clearExpiredSubaccountInfoBatch = async (partners) => {
    await Promise.all(
        partners.map(p => {
            if (!p.subaccountDeletedAt) return null;
            const expired = (Date.now() - p.subaccountDeletedAt.getTime()) > THIRTY_DAYS_MS;
            if (!expired) return null;
            p.bankDetails = { bankCode: null, accountNumber: null, accountName: null };
            p.subaccountDeletedAt = null;
            return p.save();
        })
    );
    return partners;
};

// ── SELF-SERVE: SIGN UP FOR AFFILIATION ──
// Opt-in only — a user is NOT a referral partner just by existing.
// Creates a one-time tier partner. Lifetime tier is admin-only (onboardPartner below).
const signUpForAffiliation = async (req, res) => {
    try {
        const user = req.user;
        const { consent } = req.body;

        if (consent !== true) {
            return res.status(400).json({ message: "You must accept the Referral Program Terms to sign up." });
        }

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
            onboardedBy: null,
            termsAcceptedAt: new Date()
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
        let partner = await ReferralPartner.findOne({ linkedUserId: req.user._id });
        if (!partner) {
            return res.status(404).json({ message: "You are not registered as a referral partner yet." });
        }
        partner = await clearExpiredSubaccountInfo(partner);

        const referredCount = await User.countDocuments({ referralPartnerId: partner._id });

        const payoutAgg = await Payment.aggregate([
            { $match: { referralPartnerId: partner._id, status: "success" } },
            { $group: {
                _id: "$referralPayoutStatus",
                total: { $sum: "$referralPayoutAmount" },
                count: { $sum: 1 }
            } }
        ]);

        // Referred-student list — meaningful mainly for lifetime-tier
        // partners (institutions), but returned for both tiers since
        // it's cheap and the frontend can choose how much of it to show.
        // Per-student payout total included so a partner can see which
        // of their referrals has generated how much, without exposing
        // any other student's personal payment details.
        const referredUsers = await User.find({ referralPartnerId: partner._id })
            .select("firstName otherName surname email createdAt")
            .sort({ createdAt: -1 });

        const perStudentTotals = await Payment.aggregate([
            { $match: { referralPartnerId: partner._id, status: "success" } },
            { $group: {
                _id: "$user",
                totalGenerated: { $sum: "$referralPayoutAmount" },
                transactionCount: { $sum: 1 }
            } }
        ]);
        const totalsByUserId = {};
        perStudentTotals.forEach(t => { totalsByUserId[t._id.toString()] = t; });

        const referredStudents = referredUsers.map(u => ({
            id: u._id,
            fullName: u.fullName,
            email: u.email,
            joinedAt: u.createdAt,
            totalGenerated: totalsByUserId[u._id.toString()]?.totalGenerated || 0,
            transactionCount: totalsByUserId[u._id.toString()]?.transactionCount || 0
        }));

        res.status(200).json({
            partner: {
                name: partner.name,
                referralCode: partner.referralCode,
                tier: partner.tier,
                status: partner.status,
                hasSubaccount: !!partner.paystackRecipientCode,
                payoutAccountName: partner.bankDetails?.accountName || null
            },
            referredStudentCount: referredCount,
            payoutBreakdown: payoutAgg,
            referredStudents
        });

    } catch (error) {
        console.error("Get my referral info error:", error);
        res.status(500).json({ message: "Failed to get referral info." });
    }
};

// ── SELF-SERVE: VERIFY BANK ACCOUNT (preview only, no save) ──
// Called by the frontend when the user types an account number, so they
// can see the resolved account name and confirm it's theirs BEFORE the
// actual save/recipient-creation step. Does not touch the ReferralPartner
// record at all.
const verifyBankAccount = async (req, res) => {
    try {
        const { bankCode, accountNumber } = req.body;

        if (!bankCode || !accountNumber) {
            return res.status(400).json({ message: "Bank code and account number are required." });
        }

        const resolveResponse = await paystackRequest(
            "GET",
            `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
        );

        if (!resolveResponse.status) {
            return res.status(400).json({ message: resolveResponse.message || "Could not verify bank account." });
        }

        res.status(200).json({ accountName: resolveResponse.data.account_name });

    } catch (error) {
        console.error("Verify bank account error:", error);
        res.status(500).json({ message: "Failed to verify bank account." });
    }
};

// ── HELPER: NOTIFY ADMIN OF PAYOUT ACCOUNT CHANGE (not just creation) ──
const notifyAdminOfAccountChange = async (partner, adminEmail, isEdit) => {
    try {
        await sendEmail(
            adminEmail,
            "ASODEM Admin",
            `Referral payout account ${isEdit ? "changed" : "created"} — ${partner.name}`,
            `<p>Partner <strong>${partner.name}</strong> (${partner.tier} tier, code ${partner.referralCode}) just
             ${isEdit ? "changed" : "set up"} their payout account.</p>
             <p>Recipient code: ${partner.paystackRecipientCode}<br/>
             Bank: ${partner.bankDetails?.accountName || "n/a"} — ${partner.bankDetails?.accountNumber || "n/a"}</p>
             <p>Please verify this on the Paystack dashboard.</p>`
        );
    } catch (err) {
        console.error("Admin account-change notification failed:", err);
    }
};

// ── SELF-SERVE: SUBMIT BANK DETAILS → CREATE/UPDATE PAYSTACK RECIPIENT ──
// Handles both the first-ever setup (no cooldown) and later edits (14-day
// cooldown, unless admin has granted a one-time override — consumed on use).
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

        const isEdit = !!partner.paystackRecipientCode;

        if (isEdit && !partner.payoutChangeOverrideGranted) {
            const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
            const lastChange = partner.lastPayoutAccountChangeAt;
            if (lastChange && (Date.now() - lastChange.getTime()) < COOLDOWN_MS) {
                const daysRemaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastChange.getTime())) / (24 * 60 * 60 * 1000));
                return res.status(403).json({
                    message: `Payout account details can only be changed once every 14 days. Please try again in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}, or ask an admin to grant an early-change override.`,
                    code: "PAYOUT_CHANGE_COOLDOWN",
                    daysRemaining
                });
            }
        }

        // Resolve account name via Paystack before creating the recipient —
        // never trusts a client-supplied name from the earlier preview step.
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
        partner.subaccountDeletedAt = null;
        partner.lastPayoutAccountChangeAt = new Date();
        if (isEdit && partner.payoutChangeOverrideGranted) {
            partner.payoutChangeOverrideGranted = false; // consume the one-time override
        }
        await partner.save();

        if (process.env.ADMIN_NOTIFICATION_EMAIL) {
            await notifyAdminOfAccountChange(partner, process.env.ADMIN_NOTIFICATION_EMAIL, isEdit);
        } else {
            console.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping admin notification email.");
        }

        await logActivity({
            user: req.user._id, email: req.user.email,
            event: isEdit ? "referral_payout_account_edited" : "referral_payout_account_set",
            metadata: { referralPartnerId: partner._id.toString(), accountName }, req
        });

        res.status(200).json({
            message: isEdit
                ? "Payout account updated successfully."
                : "Payout account set up successfully. Any pending payouts will now be processed.",
            accountName
        });

    } catch (error) {
        console.error("Setup payout account error:", error);
        res.status(500).json({ message: "Failed to set up payout account." });
    }
};

// ── SELF-SERVE: OPT OUT OF THE REFERRAL PROGRAM ──
// Reuses the same status field admin deactivation uses — deactivation
// already means "redirect payouts to ASODEM" regardless of who triggered
// it (see processReferralPayout in payment.controller.js). Admin gets an
// email alert specifically for self-initiated opt-outs.
const optOutOfReferralProgram = async (req, res) => {
    try {
        const partner = await ReferralPartner.findOne({ linkedUserId: req.user._id });
        if (!partner) {
            return res.status(404).json({ message: "You are not registered as a referral partner." });
        }

        if (partner.status === "inactive") {
            return res.status(400).json({ message: "You have already opted out." });
        }

        partner.status = "inactive";
        await partner.save();

        if (process.env.ADMIN_NOTIFICATION_EMAIL) {
            try {
                await sendEmail(
                    process.env.ADMIN_NOTIFICATION_EMAIL,
                    "ASODEM Admin",
                    `Referral partner opted out — ${partner.name}`,
                    `<p>Partner <strong>${partner.name}</strong> (${partner.tier} tier, code ${partner.referralCode}) has opted out of the referral program.</p>
                     <p>Future referral payouts for their existing referred students will be redirected to ASODEM until they opt back in.</p>`
                );
            } catch (err) {
                console.error("Admin opt-out notification failed:", err);
            }
        }

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_opted_out",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({ message: "You have opted out of the referral program. Future payouts will not be processed until you opt back in." });

    } catch (error) {
        console.error("Opt out error:", error);
        res.status(500).json({ message: "Failed to opt out." });
    }
};

// ── SELF-SERVE: OPT BACK IN ──
const optBackIntoReferralProgram = async (req, res) => {
    try {
        const partner = await ReferralPartner.findOne({ linkedUserId: req.user._id });
        if (!partner) {
            return res.status(404).json({ message: "You are not registered as a referral partner." });
        }

        if (partner.status === "active") {
            return res.status(400).json({ message: "You are already active." });
        }

        partner.status = "active";
        await partner.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_opted_back_in",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({ message: "Welcome back — your referral program is active again." });

    } catch (error) {
        console.error("Opt back in error:", error);
        res.status(500).json({ message: "Failed to opt back in." });
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

        await clearExpiredSubaccountInfoBatch(partners);

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

// ── ADMIN: GRANT A ONE-TIME PAYOUT-ACCOUNT-CHANGE COOLDOWN OVERRIDE ──
// Consumed automatically the next time the partner successfully changes
// their bank details — never a standing bypass.
const grantPayoutChangeOverride = async (req, res) => {
    try {
        const partner = await ReferralPartner.findById(req.params.id);
        if (!partner) return res.status(404).json({ message: "Partner not found." });

        partner.payoutChangeOverrideGranted = true;
        await partner.save();

        await logActivity({
            user: req.user._id, email: req.user.email, event: "referral_payout_override_granted",
            metadata: { referralPartnerId: partner._id.toString() }, req
        });

        res.status(200).json({ message: "Override granted. The partner can now change their payout account once before the 14-day cooldown normally applies." });

    } catch (error) {
        console.error("Grant payout override error:", error);
        res.status(500).json({ message: "Failed to grant override." });
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

// ── LIST NIGERIAN BANKS (for the payout-account bank-code dropdown) ──
// Available to any logged-in user, not admin-only — this is what the
// self-serve setupPayoutAccount form will need to populate its dropdown.
const getBankList = async (req, res) => {
    try {
        const response = await paystackRequest("GET", "/bank?country=nigeria&currency=NGN");

        if (!response.status) {
            return res.status(400).json({ message: response.message || "Failed to fetch bank list." });
        }

        const banks = response.data.map(b => ({ name: b.name, code: b.code }));

        res.status(200).json({ banks });

    } catch (error) {
        console.error("Get bank list error:", error);
        res.status(500).json({ message: "Failed to get bank list." });
    }
};

// ── ADMIN: LIST ALL SUBACCOUNTS/RECIPIENTS (for pruning) ──
const getAllSubaccounts = async (req, res) => {
    try {
        const partners = await ReferralPartner.find({ paystackRecipientCode: { $ne: null } })
            .populate("linkedUserId", "firstName surname email")
            .select("name referralCode tier paystackRecipientCode bankDetails subaccountDeletedAt")
            .sort({ createdAt: -1 });

        await clearExpiredSubaccountInfoBatch(partners);

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
    verifyBankAccount,
    optOutOfReferralProgram,
    optBackIntoReferralProgram,
    getBankList,
    onboardPartner,
    getAllPartners,
    editPartner,
    togglePartnerStatus,
    grantPayoutChangeOverride,
    reassignStudentPartner,
    getPartnerSettlement,
    getReferralSettings,
    updateReferralSettings,
    getAllSubaccounts,
    deleteSubaccount
};