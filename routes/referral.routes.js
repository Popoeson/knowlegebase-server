const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
    signUpForAffiliation,
    getMyReferralInfo,
    setupPayoutAccount,
    getBankList
} = require("../controllers/referral.controller");

// Self-serve — any logged-in, paid user can opt into affiliation.
router.post("/signup", protect, signUpForAffiliation);
router.get("/me", protect, getMyReferralInfo);
router.put("/payout-account", protect, setupPayoutAccount);
router.get("/banks", protect, getBankList);

module.exports = router;