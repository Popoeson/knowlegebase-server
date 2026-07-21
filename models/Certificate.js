const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true
        },
       examAttempt: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExamAttempt",
            required: true,
            unique: true
        },
        certificateId: {
            type: String,
            required: true,
            unique: true
        },
        // Snapshots of the user's name and course title, taken at the
        // moment the certificate is issued. Verification prefers the live
        // populated User/Course record (so a legitimate name change still
        // shows correctly), but falls back to these if that record is ever
        // missing — certificates are meant to stay verifiable permanently,
        // independent of whether the underlying account or course still
        // exists.
        userFullNameSnapshot: {
            type: String,
            default: null
        },
        courseTitleSnapshot: {
            type: String,
            default: null
        },
        issuedAt: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ["active", "revoked"],
            default: "active"
        },
        pdfUrl: {
            type: String,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Certificate", certificateSchema);