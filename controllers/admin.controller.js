const User = require("../models/User");
const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");
const { uploadToCloudinary } = require("../config/cloudinary");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// ── ADMIN DASHBOARD STATS ──
const getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "user" });
        const totalCourses = await Course.countDocuments({ isActive: true });
        const totalQuestions = await Question.countDocuments({ isActive: true });

        res.status(200).json({
            stats: { totalUsers, totalCourses, totalQuestions }
        });
    } catch (error) {
        console.error("Admin dashboard error:", error);
        res.status(500).json({ message: "Failed to get dashboard stats." });
    }
};


// ── GET ALL USERS ──
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


// ── DELETE USER ──
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.role === "admin") {
            return res.status(403).json({ message: "Cannot delete admin" });
        }

        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user." });
    }
};


// ── GET ALL COURSES ──
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


// ── CREATE COURSE ──
const createCourse = async (req, res) => {
    try {
        const {
            title, category, description, difficulty, duration,
            topics, certificationQuestions, practiceQuestions,
            timeLimit, passMark, price
        } = req.body;

        if (!title || !category || !description || !duration || !timeLimit || !passMark || !price) {
            return res.status(400).json({ message: "All required fields must be filled" });
        }

        let parsedTopics = topics
            ? (typeof topics === "string" ? JSON.parse(topics) : topics)
            : [];

        let thumbnail = null;
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
        res.status(500).json({ message: "Failed to create course." });
    }
};


// ── EDIT COURSE ──
const editCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: "Course not found" });

        const {
            title, category, description, difficulty, duration,
            topics, certificationQuestions, practiceQuestions,
            timeLimit, passMark, price
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
        res.status(500).json({ message: "Failed to update course." });
    }
};


// ── TOGGLE COURSE STATUS ──
const toggleCourseStatus = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: "Course not found" });

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


// ── DELETE COURSE ──
const deleteCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: "Course not found" });

        course.isActive = false;
        await course.save();

        res.status(200).json({ message: "Course deleted successfully" });
    } catch (error) {
        console.error("Delete course error:", error);
        res.status(500).json({ message: "Failed to delete course." });
    }
};


// ── GET ALL CATEGORIES ──
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.status(200).json({ categories });
    } catch (error) {
        console.error("Get categories error:", error);
        res.status(500).json({ message: "Failed to get categories." });
    }
};


// ── CREATE CATEGORY ──
const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: "Category name is required" });

        const existing = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, "i") }
        });
        if (existing) return res.status(400).json({ message: "Category already exists" });

        const category = await Category.create({ name });

        res.status(201).json({ message: "Category created successfully", category });
    } catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({ message: "Failed to create category." });
    }
};


// ── EDIT CATEGORY ──
const editCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: "Category name is required" });

        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ message: "Category not found" });

        category.name = name;
        await category.save();

        res.status(200).json({ message: "Category updated successfully", category });
    } catch (error) {
        console.error("Edit category error:", error);
        res.status(500).json({ message: "Failed to update category." });
    }
};


// ── DELETE CATEGORY ──
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ message: "Category not found" });

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


// ── AI QUESTION GENERATION (GEMINI) ──
// Calls Gemini, runs duplicate check, returns questions for admin review.
// Nothing is saved to the database at this stage.
const generateQuestionsWithAI = async (req, res) => {
    try {
        const { courseId, topicName, difficulty, count, type } = req.body;

        if (!courseId || !topicName || !difficulty || !count || !type) {
            return res.status(400).json({ message: "courseId, topicName, difficulty, count, and type are required" });
        }

        if (!["practice", "certification"].includes(type)) {
            return res.status(400).json({ message: "type must be 'practice' or 'certification'" });
        }

        if (!["Beginner", "Intermediate", "Advanced"].includes(difficulty)) {
            return res.status(400).json({ message: "difficulty must be Beginner, Intermediate, or Advanced" });
        }

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ message: "Course not found" });

        const questionCount = Math.min(Math.max(Number(count), 1), 50);

        const prompt = `You are an exam question writer for a professional certification platform.

Generate exactly ${questionCount} multiple-choice questions on the topic: "${topicName}".
Course context: ${course.title}
Difficulty level: ${difficulty}

Difficulty guidelines:
- Beginner: foundational concepts, definitions, basic understanding
- Intermediate: applied knowledge, problem-solving, comparisons
- Advanced: edge cases, deep technical reasoning, architecture decisions

Return ONLY a pure JSON array with no markdown, no code fences, no extra text.
Each object must follow this exact structure:
{
  "question": "Question text here",
  "optionA": "First option",
  "optionB": "Second option",
  "optionC": "Third option",
  "optionD": "Fourth option",
  "correctAnswer": "A",
  "explanation": "Brief explanation of why the answer is correct"
}

Rules:
- correctAnswer must be exactly one of: A, B, C, or D
- All four options must be distinct and plausible
- Do not number the questions
- Do not include any text outside the JSON array`;

        // Call Gemini
        let rawText = "";
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

            const result = await model.generateContent(prompt);
            rawText = result.response.text();
        } catch (err) {
            console.error("Gemini error:", err);
            return res.status(502).json({ message: "AI service failed. Please try again." });
        }

        // Strip any markdown fences Gemini may have added despite instructions
        const cleaned = rawText
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (err) {
            console.error("Failed to parse Gemini response:", rawText);
            return res.status(502).json({ message: "AI returned an unexpected format. Please try again." });
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return res.status(502).json({ message: "AI returned no questions. Please try again." });
        }

        // Validate structure of each question
        const validAnswers = ["A", "B", "C", "D"];
        const validQuestions = parsed.filter(q =>
            q.question && q.optionA && q.optionB && q.optionC && q.optionD &&
            validAnswers.includes(q.correctAnswer)
        );

        if (validQuestions.length === 0) {
            return res.status(502).json({ message: "AI questions failed validation. Please try again." });
        }

        // Duplicate detection — check each question against existing DB entries for this course
        const duplicateCheckResults = await Promise.all(
            validQuestions.map(async (q) => {
                const exists = await Question.findOne({
                    course: courseId,
                    question: { $regex: new RegExp(`^${q.question.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
                });
                return { question: q, isDuplicate: !!exists };
            })
        );

        const unique = duplicateCheckResults.filter(r => !r.isDuplicate).map(r => r.question);
        const duplicateCount = duplicateCheckResults.length - unique.length;

        if (unique.length === 0) {
            return res.status(409).json({
                message: "All generated questions already exist in this course. Try a different topic or difficulty."
            });
        }

        // Return for admin review — nothing saved yet
        res.status(200).json({
            message: `${unique.length} question${unique.length !== 1 ? "s" : ""} ready for review${duplicateCount > 0 ? `. ${duplicateCount} duplicate${duplicateCount > 1 ? "s" : ""} removed.` : "."}`,
            questions: unique,
            duplicatesRemoved: duplicateCount
        });

    } catch (error) {
        console.error("AI generation error:", error);
        res.status(500).json({ message: "Failed to generate questions. Please try again." });
    }
};


// ── APPROVE AND SAVE AI QUESTIONS ──
// Admin reviews questions on the frontend, selects which to approve,
// and this endpoint saves only the approved ones to the database.
const saveApprovedQuestions = async (req, res) => {
    try {
        const { courseId, questions, type, difficulty } = req.body;

        if (!courseId || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ message: "courseId and a non-empty questions array are required" });
        }

        if (!["practice", "certification"].includes(type)) {
            return res.status(400).json({ message: "type must be 'practice' or 'certification'" });
        }

        if (!["Beginner", "Intermediate", "Advanced"].includes(difficulty)) {
            return res.status(400).json({ message: "difficulty must be Beginner, Intermediate, or Advanced" });
        }

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ message: "Course not found" });

        // Run a final duplicate check before saving — guards against double submissions
        const duplicateCheckResults = await Promise.all(
            questions.map(async (q) => {
                const exists = await Question.findOne({
                    course: courseId,
                    question: { $regex: new RegExp(`^${q.question.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
                });
                return { question: q, isDuplicate: !!exists };
            })
        );

        const toInsert = duplicateCheckResults
            .filter(r => !r.isDuplicate)
            .map(r => ({
                course: courseId,
                question: r.question.question.trim(),
                optionA: r.question.optionA.trim(),
                optionB: r.question.optionB.trim(),
                optionC: r.question.optionC.trim(),
                optionD: r.question.optionD.trim(),
                correctAnswer: r.question.correctAnswer,
                type,
                difficulty,
                explanation: r.question.explanation ? r.question.explanation.trim() : null,
                isActive: true,
                createdByAI: true,
                isApproved: true,
                approvedBy: req.user._id,
                approvedAt: new Date()
            }));

        if (toInsert.length === 0) {
            return res.status(409).json({
                message: "All selected questions already exist in this course."
            });
        }

        const saved = await Question.insertMany(toInsert);

        res.status(201).json({
            message: `${saved.length} question${saved.length !== 1 ? "s" : ""} saved successfully`,
            savedCount: saved.length
        });

    } catch (error) {
        console.error("Save approved questions error:", error);
        res.status(500).json({ message: "Failed to save questions. Please try again." });
    }
};


// ── REJECT AI QUESTIONS ──
// Admin rejects the entire generated batch. Since nothing was saved,
// this is a no-op on the DB — it just returns a confirmation.
// Included as an explicit endpoint for clean frontend request handling.
const rejectAIQuestions = async (req, res) => {
    res.status(200).json({ message: "Questions rejected. Nothing was saved." });
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
    deleteCategory,
    generateQuestionsWithAI,
    saveApprovedQuestions,
    rejectAIQuestions
};