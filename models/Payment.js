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
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);