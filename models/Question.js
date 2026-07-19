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
        difficulty: {
            type: String,
            enum: ["Beginner", "Intermediate", "Advanced"],
            default: null
        },
        explanation: {
            type: String,
            trim: true,
            default: null
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdByAI: {
            type: Boolean,
            default: false
        },
        isApproved: {
            type: Boolean,
            default: true
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        approvedAt: {
            type: Date,
            default: null
        },
        // Lowercased, trimmed copy of `question`, kept in sync automatically
        // (see pre-save hook below). Duplicate-detection queries match
        // against this field with an exact string comparison instead of a
        // case-insensitive regex — regexes with the /i flag can't use a
        // standard index for the text portion, so as question banks grow
        // (especially via AI generation) those checks would otherwise get
        // slower per question added, scanning every question in the course
        // instead of doing a direct indexed lookup.
        questionNormalized: {
            type: String,
            default: null
        }
    },
    { timestamps: true }
);

questionSchema.pre("save", function (next) {
    if (this.isModified("question")) {
        this.questionNormalized = this.question.trim().toLowerCase();
    }
    next();
});

// Note: this hook only fires on .create()/.save() — insertMany() calls
// (bulk upload, AI-approved batch save) must set questionNormalized
// explicitly themselves. Both call sites already do this — see
// question.controller.js and admin.controller.js.
questionSchema.index({ course: 1, type: 1, questionNormalized: 1 });

module.exports = mongoose.model("Question", questionSchema);