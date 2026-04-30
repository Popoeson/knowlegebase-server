const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Course title is required"],
            trim: true
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: [true, "Category is required"]
        },
        description: {
            type: String,
            required: [true, "Course description is required"],
            trim: true
        },
        difficulty: {
            type: String,
            enum: ["Beginner", "Intermediate", "Advanced"],
            default: "Beginner"
        },
        duration: {
            type: Number,
            required: [true, "Duration is required"],
            comment: "Duration in minutes"
        },
        topics: {
            type: [String],
            default: []
        },
        certificationQuestions: {
            type: Number,
            required: [true, "Number of certification questions is required"],
            default: 30
        },
        practiceQuestions: {
            type: Number,
            required: [true, "Number of practice questions is required"],
            default: 20
        },
        timeLimit: {
            type: Number,
            required: [true, "Time limit is required"],
            comment: "Time limit in minutes"
        },
        passMark: {
            type: Number,
            required: [true, "Pass mark is required"],
            min: 1,
            max: 100,
            comment: "Pass mark as percentage"
        },
        price: {
            type: Number,
            required: [true, "Price is required"],
            comment: "Price in USD"
        },
        isActive: {
            type: Boolean,
            default: true
        },
        thumbnail: {
            type: String,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);