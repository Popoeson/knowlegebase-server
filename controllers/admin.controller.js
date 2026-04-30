const User = require("../models/User");
const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");
const { uploadToCloudinary } = require("../config/cloudinary");

// ── ADMIN DASHBOARD STATS ──
const getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "user" });
        const totalCourses = await Course.countDocuments({ isActive: true });
        const totalQuestions = await Question.countDocuments({ isActive: true });

        res.status(200).json({
            stats: {
                totalUsers,
                totalCourses,
                totalQuestions
            }
        });

    } catch (error) {
        console.error("Admin dashboard error:", error);
        res.status(500).json({ message: "Failed to get dashboard stats." });
    }
};

// ── GET ALL USERS (ADMIN) ──
const getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: "user" })
            .select("-password -otp -otpExpires")
            .sort({ createdAt: -1 });

        res.status(200).json({ users });

    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ message: "Failed to get users." });
    }
};

// ── DELETE USER (ADMIN) ──
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role === "admin") {
            return res.status(403).json({ message: "Cannot delete an admin account" });
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "User deleted successfully" });

    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user." });
    }
};

// ── GET ALL COURSES (ADMIN) ──
const getAllCourses = async (req, res) => {
    try {
        const courses = await Course.find()
            .populate("category", "name")
            .sort({ createdAt: -1 });

        res.status(200).json({ courses });

    } catch (error) {
        console.error("Get all courses error:", error);
        res.status(500).json({ message: "Failed to get courses." });
    }
};

// ── CREATE COURSE (ADMIN) ──
const createCourse = async (req, res) => {
    try {
        const {
            title,
            category,
            description,
            difficulty,
            duration,
            topics,
            certificationQuestions,
            practiceQuestions,
            timeLimit,
            passMark,
            price
        } = req.body;

        if (!title || !category || !description || !duration || !timeLimit || !passMark || !price) {
            return res.status(400).json({ message: "All required fields must be filled" });
        }

        // Parse topics
        let parsedTopics = [];
        if (topics) {
            parsedTopics = typeof topics === "string" ? JSON.parse(topics) : topics;
        }

        let thumbnail = null;

        // Handle thumbnail upload
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: "knowledgebase/courses"
            });
            thumbnail = result.secure_url;
        }

        const course = await Course.create({
            title,
            category,
            description,
            difficulty: difficulty || "Beginner",
            duration: Number(duration),
            topics: parsedTopics,
            certificationQuestions: Number(certificationQuestions) || 30,
            practiceQuestions: Number(practiceQuestions) || 20,
            timeLimit: Number(timeLimit),
            passMark: Number(passMark),
            price: Number(price),
            thumbnail
        });

        const populated = await Course.findById(course._id).populate("category", "name");

        res.status(201).json({
            message: "Course created successfully",
            course: populated
        });

    } catch (error) {
        console.error("Create course error:", error);
        res.status(500).json({ message: "Failed to create course. Please try again." });
    }
};

// ── EDIT COURSE (ADMIN) ──
const editCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        const {
            title,
            category,
            description,
            difficulty,
            duration,
            topics,
            certificationQuestions,
            practiceQuestions,
            timeLimit,
            passMark,
            price
        } = req.body;

        if (title) course.title = title;
        if (category) course.category = category;
        if (description) course.description = description;
        if (difficulty) course.difficulty = difficulty;
        if (duration) course.duration = Number(duration);
        if (certificationQuestions) course.certificationQuestions = Number(certificationQuestions);
        if (practiceQuestions) course.practiceQuestions = Number(practiceQuestions);
        if (timeLimit) course.timeLimit = Number(timeLimit);
        if (passMark) course.passMark = Number(passMark);
        if (price) course.price = Number(price);

        if (topics) {
            course.topics = typeof topics === "string" ? JSON.parse(topics) : topics;
        }

        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: "knowledgebase/courses"
            });
            course.thumbnail = result.secure_url;
        }

        await course.save();

        const populated = await Course.findById(course._id).populate("category", "name");

        res.status(200).json({
            message: "Course updated successfully",
            course: populated
        });

    } catch (error) {
        console.error("Edit course error:", error);
        res.status(500).json({ message: "Failed to update course. Please try again." });
    }
};

// ── TOGGLE COURSE STATUS (ADMIN) ──
const toggleCourseStatus = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        course.isActive = !course.isActive;
        await course.save();

        res.status(200).json({
            message: `Course ${course.isActive ? "activated" : "deactivated"} successfully`,
            isActive: course.isActive
        });

    } catch (error) {
        console.error("Toggle course status error:", error);
        res.status(500).json({ message: "Failed to update course status." });
    }
};

// ── DELETE COURSE (ADMIN) ──
const deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        course.isActive = false;
        await course.save();

        res.status(200).json({ message: "Course deleted successfully" });

    } catch (error) {
        console.error("Delete course error:", error);
        res.status(500).json({ message: "Failed to delete course." });
    }
};

// ── GET ALL CATEGORIES (ADMIN) ──
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.status(200).json({ categories });

    } catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ message: "Failed to get categories." });
    }
};

// ── CREATE CATEGORY (ADMIN) ──
const createCategory = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
        if (existing) {
            return res.status(400).json({ message: "Category already exists" });
        }

        const category = await Category.create({ name });

        res.status(201).json({
            message: "Category created successfully",
            category
        });

    } catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({ message: "Failed to create category." });
    }
};

// ── EDIT CATEGORY (ADMIN) ──
const editCategory = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        category.name = name;
        await category.save();

        res.status(200).json({
            message: "Category updated successfully",
            category
        });

    } catch (error) {
        console.error("Edit category error:", error);
        res.status(500).json({ message: "Failed to update category." });
    }
};

// ── DELETE CATEGORY (ADMIN) ──
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        // Check if category is in use
        const courseCount = await Course.countDocuments({ category: req.params.id });
        if (courseCount > 0) {
            return res.status(400).json({
                message: `Cannot delete — ${courseCount} course${courseCount > 1 ? "s are" : " is"} using this category`
            });
        }

        await Category.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Category deleted successfully" });

    } catch (error) {
        console.error("Delete category error:", error);
        res.status(500).json({ message: "Failed to delete category." });
    }
};

module.exports = {
    getDashboardStats,
    getUsers,
    deleteUser,
    getAllCourses,
    createCourse,
    editCourse,
    toggleCourseStatus,
    deleteCourse,
    getCategories,
    createCategory,
    editCategory,
    deleteCategory
};