const User = require("../models/User");
const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");
const { uploadToCloudinary } = require("../config/cloudinary");
const Cache = require("../utils/cache");

const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── ADMIN DASHBOARD STATS ──
const getDashboardStats = async (req, res) => {
    try {
        const cacheKey = "admin:stats";
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const totalUsers = await User.countDocuments({ role: "user" });
        const totalCourses = await Course.countDocuments({ isActive: true });
        const totalQuestions = await Question.countDocuments({ isActive: true });

        const payload = { stats: { totalUsers, totalCourses, totalQuestions } };
        Cache.set(cacheKey, payload, 300); // 5 minutes
        res.status(200).json(payload);

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

        Cache.invalidate("admin:stats"); // user count changed
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user." });
    }
};


// ── GET ALL COURSES (ADMIN) ──
const getAllCourses = async (req, res) => {
    try {
        const cacheKey = "admin:courses:all";
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const courses = await Course.find()
            .populate("category", "name")
            .sort({ createdAt: -1 });

        const payload = { courses };
        Cache.set(cacheKey, payload, 600); // 10 minutes
        res.status(200).json(payload);

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

        // Invalidate course caches — new course exists
        Cache.invalidate("courses:all");
        Cache.invalidate("admin:courses:all");
        Cache.invalidate("admin:stats");

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

        // Invalidate this course and all course lists
        Cache.invalidate("courses:all");
        Cache.invalidate("admin:courses:all");
        Cache.invalidate(`course:${req.params.id}`);

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

        // Invalidate affected caches
        Cache.invalidate("courses:all");
        Cache.invalidate("admin:courses:all");
        Cache.invalidate(`course:${req.params.id}`);
        Cache.invalidate("admin:stats");

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

        // Invalidate affected caches
        Cache.invalidate("courses:all");
        Cache.invalidate("admin:courses:all");
        Cache.invalidate(`course:${req.params.id}`);
        Cache.invalidate("admin:stats");

        res.status(200).json({ message: "Course deleted successfully" });
    } catch (error) {
        console.error("Delete course error:", error);
        res.status(500).json({ message: "Failed to delete course." });
    }
};


// ── GET ALL CATEGORIES ──
const getCategories = async (req, res) => {
    try {
        const cacheKey = "categories:all";
        const cached = Cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const categories = await Category.find().sort({ name: 1 });

        const payload = { categories };
        Cache.set(cacheKey, payload, 1800); // 30 minutes
        res.status(200).json(payload);

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

        Cache.invalidate("categories:all");

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

        Cache.invalidate("categories:all");

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

        Cache.invalidate("categories:all");

        res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        console.error("Delete category error:", error);
        res.status(500).json({ message: "Failed to delete category." });
    }
};


// ── AI QUESTION GENERATION (GROQ) ──
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

Your goal is to generate HIGH-QUALITY, JOB-READY assessment questions — not just theoretical or memorization-based questions.

Generate exactly ${questionCount} multiple-choice questions on the topic: "${topicName}".
Course context: ${course.title}
Difficulty level: ${difficulty}

STRICT QUESTION DESIGN RULES:

1. All questions MUST be scenario-based or context-driven.
   - Avoid direct definition questions like "What is X?"
   - Frame questions as real-world situations, problems, or decisions.

2. Each question must test THINKING, not memorization:
   - Beginner → understanding + recognition in context
   - Intermediate → application + decision-making
   - Advanced → judgment, trade-offs, edge cases, or system design reasoning

3. Distractors (wrong options) MUST be:
   - Plausible and realistic
   - Based on common mistakes or misconceptions
   - Similar in length and tone to the correct answer
   - NOT obviously wrong or unrelated

4. Avoid patterns:
   - Randomize correct answer positions (A–D)
   - Do not repeat similar wording across questions

5. Explanations must:
   - Clearly justify WHY the correct answer is right
   - Briefly explain WHY other options are wrong (especially for Intermediate & Advanced)

6. Advanced difficulty MUST include at least one of:
   - Trade-offs (e.g., performance vs accuracy)
   - Edge cases or failure scenarios
   - System/architecture-level reasoning
   - "Best choice" instead of "only correct answer"

7. Ensure at least:
   - 30% of questions involve problem-solving
   - 20% involve decision-making
   - 10% include subtle traps or common misconceptions

OUTPUT FORMAT:

Return ONLY a pure JSON array with no markdown, no code fences, no extra text.

Each object must follow this exact structure:
{
  "question": "Question text here",
  "optionA": "First option",
  "optionB": "Second option",
  "optionC": "Third option",
  "optionD": "Fourth option",
  "correctAnswer": "A",
  "explanation": "Clear and concise explanation"
}

STRICT OUTPUT RULES:
- correctAnswer must be exactly one of: A, B, C, or D
- All four options must be distinct
- Do not number the questions
- Do not include any text outside the JSON array`;

        let rawText = "";
        try {
            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            });
            rawText = completion.choices[0].message.content;
        } catch (err) {
            console.error("Groq error:", err);
            if (err.status === 429) {
                return res.status(429).json({ message: "AI quota exceeded. Please wait a moment and try again." });
            }
            return res.status(502).json({ message: "AI service failed. Please try again." });
        }

        let parsed;
try {
    // Strip markdown fences
    let cleaned = rawText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    // If Llama added text before or after the array, extract just the array
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");

    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd < arrayStart) {
        console.error("No JSON array found in Groq response:", rawText);
        return res.status(502).json({ message: "AI returned an unexpected format. Please try again." });
    }

    cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
    parsed = JSON.parse(cleaned);

} catch (err) {
    console.error("Failed to parse Groq response:", rawText);
    return res.status(502).json({ message: "AI returned an unexpected format. Please try again." });
}

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return res.status(502).json({ message: "AI returned no questions. Please try again." });
        }

        const validAnswers = ["A", "B", "C", "D"];
        const validQuestions = parsed.filter(q =>
            q.question && q.optionA && q.optionB && q.optionC && q.optionD &&
            validAnswers.includes(q.correctAnswer)
        );

        if (validQuestions.length === 0) {
            return res.status(502).json({ message: "AI questions failed validation. Please try again." });
        }

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

        // Question counts changed — invalidate the affected course detail cache
        Cache.invalidate(`course:${courseId}`);
        Cache.invalidate("admin:stats");

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