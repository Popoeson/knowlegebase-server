const Question = require("../models/Question");
const Course = require("../models/Course");
const xlsx = require("xlsx");

// ── GET QUESTIONS BY COURSE (ADMIN) ──
const getQuestions = async (req, res) => {
    try {
        const { courseId, type } = req.query;

        const filter = { isActive: true };
        if (courseId) filter.course = courseId;
        if (type) filter.type = type;

        const questions = await Question.find(filter)
            .populate("course", "title")
            .sort({ createdAt: -1 });

        res.status(200).json({ questions });

    } catch (error) {
        console.error("Get questions error:", error);
        res.status(500).json({ message: "Failed to get questions. Please try again." });
    }
};

// ── ADD SINGLE QUESTION (ADMIN) ──
const addQuestion = async (req, res) => {
    try {
        const {
            course,
            question,
            optionA,
            optionB,
            optionC,
            optionD,
            correctAnswer,
            type,
            explanation
        } = req.body;

        if (!course || !question || !optionA || !optionB || !optionC || !optionD || !correctAnswer || !type) {
            return res.status(400).json({ message: "All required fields must be filled" });
        }

        // Verify course exists
        const courseExists = await Course.findById(course);
        if (!courseExists) {
            return res.status(404).json({ message: "Course not found" });
        }

        const newQuestion = await Question.create({
            course,
            question,
            optionA,
            optionB,
            optionC,
            optionD,
            correctAnswer: correctAnswer.toUpperCase(),
            type,
            explanation: explanation || null
        });

        res.status(201).json({
            message: "Question added successfully",
            question: newQuestion
        });

    } catch (error) {
        console.error("Add question error:", error);
        res.status(500).json({ message: "Failed to add question. Please try again." });
    }
};

// ── EDIT QUESTION (ADMIN) ──
const editQuestion = async (req, res) => {
    try {
        const {
            question,
            optionA,
            optionB,
            optionC,
            optionD,
            correctAnswer,
            type,
            explanation
        } = req.body;

        const existing = await Question.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ message: "Question not found" });
        }

        if (question) existing.question = question;
        if (optionA) existing.optionA = optionA;
        if (optionB) existing.optionB = optionB;
        if (optionC) existing.optionC = optionC;
        if (optionD) existing.optionD = optionD;
        if (correctAnswer) existing.correctAnswer = correctAnswer.toUpperCase();
        if (type) existing.type = type;
        if (explanation !== undefined) existing.explanation = explanation;

        await existing.save();

        res.status(200).json({
            message: "Question updated successfully",
            question: existing
        });

    } catch (error) {
        console.error("Edit question error:", error);
        res.status(500).json({ message: "Failed to update question. Please try again." });
    }
};

// ── DELETE QUESTION (ADMIN) ──
const deleteQuestion = async (req, res) => {
    try {
        const question = await Question.findById(req.params.id);
        if (!question) {
            return res.status(404).json({ message: "Question not found" });
        }

        question.isActive = false;
        await question.save();

        res.status(200).json({ message: "Question deleted successfully" });

    } catch (error) {
        console.error("Delete question error:", error);
        res.status(500).json({ message: "Failed to delete question. Please try again." });
    }
};

// ── BULK UPLOAD QUESTIONS (ADMIN) ──
const bulkUploadQuestions = async (req, res) => {
    try {
        const { courseId, type } = req.body;

        if (!courseId || !type) {
            return res.status(400).json({ message: "Course and question type are required" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Please upload a file" });
        }

        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Parse the uploaded file
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

        if (rows.length === 0) {
            return res.status(400).json({ message: "File is empty or has no valid rows" });
        }

        const validQuestions = [];
        const skippedRows = [];

        rows.forEach((row, index) => {
            const rowNum = index + 2; // +2 because row 1 is header

            const question = String(row["question"] || "").trim();
            const optionA = String(row["option_a"] || "").trim();
            const optionB = String(row["option_b"] || "").trim();
            const optionC = String(row["option_c"] || "").trim();
            const optionD = String(row["option_d"] || "").trim();
            const correctAnswer = String(row["correct_answer"] || "").trim().toUpperCase();
            const explanation = String(row["explanation"] || "").trim();

            // Validate row
            if (!question || !optionA || !optionB || !optionC || !optionD) {
                skippedRows.push(`Row ${rowNum}: Missing question or options`);
                return;
            }

            if (!["A", "B", "C", "D"].includes(correctAnswer)) {
                skippedRows.push(`Row ${rowNum}: Invalid correct answer "${correctAnswer}" — must be A, B, C or D`);
                return;
            }

            validQuestions.push({
                course: courseId,
                question,
                optionA,
                optionB,
                optionC,
                optionD,
                correctAnswer,
                type,
                explanation: explanation || null
            });
        });

        if (validQuestions.length === 0) {
            return res.status(400).json({
                message: "No valid questions found in file",
                skippedRows
            });
        }

        // Save all valid questions
        await Question.insertMany(validQuestions);

        res.status(201).json({
            message: `${validQuestions.length} question${validQuestions.length > 1 ? "s" : ""} uploaded successfully`,
            uploaded: validQuestions.length,
            skipped: skippedRows.length,
            skippedRows
        });

    } catch (error) {
        console.error("Bulk upload error:", error);
        res.status(500).json({ message: "Failed to upload questions. Please try again." });
    }
};

// ── DOWNLOAD TEMPLATE (ADMIN) ──
const downloadTemplate = async (req, res) => {
    try {
        const templateData = [
            {
                question: "What does CPU stand for?",
                option_a: "Central Processing Unit",
                option_b: "Computer Personal Unit",
                option_c: "Central Personal Unit",
                option_d: "Core Processing Unit",
                correct_answer: "A",
                explanation: "CPU stands for Central Processing Unit"
            },
            {
                question: "Which of the following is an example question?",
                option_a: "Option A text here",
                option_b: "Option B text here",
                option_c: "Option C text here",
                option_d: "Option D text here",
                correct_answer: "B",
                explanation: "Optional explanation here"
            }
        ];

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(templateData);

        // Set column widths
        worksheet["!cols"] = [
            { wch: 50 }, // question
            { wch: 30 }, // option_a
            { wch: 30 }, // option_b
            { wch: 30 }, // option_c
            { wch: 30 }, // option_d
            { wch: 15 }, // correct_answer
            { wch: 50 }  // explanation
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, "Questions");

        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Disposition", "attachment; filename=questions_template.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);

    } catch (error) {
        console.error("Download template error:", error);
        res.status(500).json({ message: "Failed to generate template. Please try again." });
    }
};

module.exports = {
    getQuestions,
    addQuestion,
    editQuestion,
    deleteQuestion,
    bulkUploadQuestions,
    downloadTemplate
};