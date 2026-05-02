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
            required: true
        },
        certificateId: {
            type: String,
            required: true,
            unique: true
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