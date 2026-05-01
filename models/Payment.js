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
            required: true
        },
        reference: {
            type: String,
            required: true,
            unique: true
        },
        amount: {
            type: Number,
            required: true,
            comment: "Amount in kobo"
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