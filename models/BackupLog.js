const mongoose = require("mongoose");

// Tracks every backup performed — lets the incremental export know exactly
// where to start ("everything changed since this timestamp"), and gives
// you a visible history of when backups actually happened.
const backupLogSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["full", "incremental"],
            required: true
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        collectionsIncluded: [String],
        documentCounts: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("BackupLog", backupLogSchema);