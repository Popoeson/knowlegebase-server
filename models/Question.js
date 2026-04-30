const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: [true, "Course is required"]
        },
        question: {
            type: String,
            required: [true, "Question text is required"],
            trim: true
        },
        optionA: {
            type: String,
            required: [true, "Option A is required"],
            trim: true
        },
        optionB: {
            type: String,
            required: [true, "Option B is required"],
            trim: true
        },
        optionC: {
            type: String,
            required: [true, "Option C is required"],
            trim: true
        },
        optionD: {
            type: String,
            required: [true, "Option D is required"],
            trim: true
        },
        correctAnswer: {
            type: String,
            enum: ["A", "B", "C", "D"],
            required: [true, "Correct answer is required"]
        },
        type: {
            type: String,
            enum: ["practice", "certification"],
            required: [true, "Question type is required"]
        },
        explanation: {
            type: String,
            trim: true,
            default: null
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);