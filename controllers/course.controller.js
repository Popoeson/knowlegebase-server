const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");
const Cache = require("../utils/cache");

// ── GET ALL ACTIVE COURSES (PUBLIC) ──
const getCourses = async (req, res) => {
    try {
        const cacheKey = "courses:all";
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const courses = await Course.find({ isActive: true })
            .populate("category", "name")
            .sort({ createdAt: -1 });

        const payload = { courses };
        Cache.set(cacheKey, payload, 600); // 10 minutes
        res.status(200).json(payload);

    } catch (error) {
        console.error("Get courses error:", error);
        res.status(500).json({ message: "Failed to get courses. Please try again." });
    }
};

// ── GET SINGLE COURSE (PUBLIC) ──
const getCourse = async (req, res) => {
    try {
        const cacheKey = `course:${req.params.id}`;
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const course = await Course.findOne({
            _id: req.params.id,
            isActive: true
        }).populate("category", "name");

        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

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

        const payload = {
            course,
            questionCounts: { certification: certificationCount, practice: practiceCount }
        };
        Cache.set(cacheKey, payload, 600); // 10 minutes
        res.status(200).json(payload);

    } catch (error) {
        console.error("Get course error:", error);
        res.status(500).json({ message: "Failed to get course. Please try again." });
    }
};

// ── GET ALL CATEGORIES (PUBLIC) ──
const getCategories = async (req, res) => {
    try {
        const cacheKey = "categories:all";
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const categories = await Category.find({ isActive: true })
            .sort({ name: 1 });

        const payload = { categories };
        Cache.set(cacheKey, payload, 1800); // 30 minutes
        res.status(200).json(payload);

    } catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ message: "Failed to get categories. Please try again." });
    }
};

module.exports = { getCourses, getCourse, getCategories };