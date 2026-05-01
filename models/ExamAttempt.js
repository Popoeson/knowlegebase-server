const mongoose = require("mongoose");

const examAttemptSchema = new mongoose.Schema(
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
        type: {
            type: String,
            enum: ["practice", "certification"],
            required: true
        },
        questions: [
            {
                question: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Question"
                },
                questionText: String,
                optionA: String,
                optionB: String,
                optionC: String,
                optionD: String,
                correctAnswer: String,
                explanation: String
            }
        ],
        answers: {
            type: Map,
            of: String,
            default: {}
        },
        score: {
            type: Number,
            default: null
        },
        passed: {
            type: Boolean,
            default: null
        },
        status: {
            type: String,
            enum: ["in-progress", "submitted", "timed-out"],
            default: "in-progress"
        },
        startedAt: {
            type: Date,
            default: Date.now
        },
        submittedAt: {
            type: Date,
            default: null
        },
        timeTaken: {
            type: Number,
            default: null,
            comment: "Time taken in seconds"
        },
        paymentRef: {
            type: String,
            default: null
        },
        tabSwitchWarned: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("ExamAttempt", examAttemptSchema);