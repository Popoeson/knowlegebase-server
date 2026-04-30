const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");

// ── GET ALL ACTIVE COURSES (PUBLIC) ──
const getCourses = async (req, res) => {
    try {
        const courses = await Course.find({ isActive: true })
            .populate("category", "name")
            .sort({ createdAt: -1 });

        res.status(200).json({ courses });

    } catch (error) {
        console.error("Get courses error:", error);
        res.status(500).json({ message: "Failed to get courses. Please try again." });
    }
};

// ── GET SINGLE COURSE (PUBLIC) ──
const getCourse = async (req, res) => {
    try {
        const course = await Course.findOne({
            _id: req.params.id,
            isActive: true
        }).populate("category", "name");

        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Get question counts
        const certificationCount = await Question.countDocuments({
            course: course._id,
            type: "certification",
            isActive: true
        });

        const practiceCount = await Question.countDocuments({
            course: course._id,
            type: "practice",
            isActive: true
        });

        res.status(200).json({
            course,
            questionCounts: {
                certification: certificationCount,
                practice: practiceCount
            }
        });

    } catch (error) {
        console.error("Get course error:", error);
        res.status(500).json({ message: "Failed to get course. Please try again." });
    }
};

// ── GET ALL CATEGORIES (PUBLIC) ──
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .sort({ name: 1 });

        res.status(200).json({ categories });

    } catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ message: "Failed to get categories. Please try again." });
    }
};

module.exports = { getCourses, getCourse, getCategories };