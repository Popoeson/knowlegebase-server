const mongoose = require("mongoose");

// Singleton document — always exactly one row. Holds the global flat
// reward for "one-time" tier (individual affiliate) partners, admin-editable
// at runtime rather than an env var, since it needs to change without a deploy.
const referralSettingsSchema = new mongoose.Schema(
    {
        individualFlatAmount: {
            type: Number,
            required: true,
            default: 0
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    { timestamps: true }
);

// Always fetch/create the single settings doc — controllers should call
// this instead of .findOne() directly, so a first-run environment doesn't
// crash on a missing settings row.
referralSettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({ individualFlatAmount: 0 });
    }
    return settings;
};

module.exports = mongoose.model("ReferralSettings", referralSettingsSchema);