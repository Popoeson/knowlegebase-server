const mongoose = require("mongoose");
const ExamAttempt = require("../models/ExamAttempt");
const Question = require("../models/Question");
const Course = require("../models/Course");
const Payment = require("../models/Payment");
const { logActivity } = require("../utils/activityLog");

// ── HELPER: SHUFFLE ARRAY ──
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// ── START ATTEMPT ──
const startAttempt = async (req, res) => {
    let claimedPayment = null;
    let reservedAttemptId = null;

    try {
        const { courseId, type } = req.body;
        const userId = req.user._id;

        if (!courseId || !type) {
            return res.status(400).json({ message: "Course and exam type are required" });
        }

        if (!["practice", "certification"].includes(type)) {
            return res.status(400).json({ message: "Invalid exam type" });
        }

        const course = await Course.findOne({ _id: courseId, isActive: true });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Check for existing in-progress attempt
        const existingAttempt = await ExamAttempt.findOne({
            user: userId,
            course: courseId,
            type,
            status: "in-progress"
        });

        if (existingAttempt) {
            const elapsed = (Date.now() - existingAttempt.startedAt) / 1000;
            const timeLimit = course.timeLimit * 60;

            if (elapsed > timeLimit + 30) {
                let correct = 0;
                existingAttempt.questions.forEach(q => {
                    const answer = existingAttempt.answers.get(q.question.toString());
                    if (answer && answer === q.correctAnswer) correct++;
                });

                const score = existingAttempt.questions.length > 0
                    ? Math.round((correct / existingAttempt.questions.length) * 100)
                    : 0;

                existingAttempt.status = "timed-out";
                existingAttempt.submittedAt = new Date();
                existingAttempt.timeTaken = Math.floor(elapsed);
                existingAttempt.score = score;
                existingAttempt.passed = score >= course.passMark;
                await existingAttempt.save();

                return res.status(400).json({
                    message: "Your previous attempt timed out and has been submitted.",
                    attemptId: existingAttempt._id
                });
            }

            return res.status(200).json({
                message: "Resuming existing attempt",
                attempt: {
                    _id: existingAttempt._id,
                    questions: existingAttempt.questions.map(q => ({
                        _id: q.question,
                        question: q.questionText,
                        optionA: q.optionA,
                        optionB: q.optionB,
                        optionC: q.optionC,
                        optionD: q.optionD
                    })),
                    startedAt: existingAttempt.startedAt,
                    timeLimit: course.timeLimit,
                    type,
                    answers: Object.fromEntries(existingAttempt.answers)
                }
            });
        }

        // Fetch questions from correct bank BEFORE touching any payment —
        // cheap validation first, so we don't claim a payment only to fail
        // on question availability afterward.
        const allQuestions = await Question.find({
            course: courseId,
            type,
            isActive: true,
            isApproved: true
        });

        const questionLimit = type === "certification"
            ? course.certificationQuestions
            : course.practiceQuestions;

        if (allQuestions.length < questionLimit) {
            return res.status(400).json({
                message: `Not enough questions available. Need ${questionLimit}, found ${allQuestions.length}.`
            });
        }

        // ── CERTIFICATION PAYMENT GATE (ATOMIC CLAIM) ──
        // Pre-generate the attempt's _id and atomically claim an unused
        // payment by setting examAttempt to that id in one findOneAndUpdate.
        // This closes a race where two concurrent /exam/start requests could
        // both read the same unused payment before either wrote back,
        // resulting in two exam attempts backed by a single payment (a free
        // sitting). If findOneAndUpdate returns null, someone already
        // claimed it — treat as unpaid.
        if (type === "certification") {
            reservedAttemptId = new mongoose.Types.ObjectId();

            claimedPayment = await Payment.findOneAndUpdate(
                {
                    user: userId,
                    course: courseId,
                    type: "certificate",
                    status: "success",
                    examAttempt: null
                },
                { $set: { examAttempt: reservedAttemptId } },
                { new: true }
            );

            if (!claimedPayment) {
                return res.status(402).json({
                    message: "Payment required to take the certification exam for this course.",
                    code: "EXAM_PAYMENT_REQUIRED",
                    courseId
                });
            }
        }

        const selected = shuffleArray(allQuestions).slice(0, questionLimit);

        const attemptQuestions = selected.map(q => ({
            question: q._id,
            questionText: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation
        }));

        let attempt;
        try {
            attempt = await ExamAttempt.create({
                _id: reservedAttemptId || undefined,
                user: userId,
                course: courseId,
                type,
                questions: attemptQuestions,
                startedAt: new Date()
            });
        } catch (createError) {
            // Roll back the claim so the payment isn't permanently stranded
            // if attempt creation fails for any reason.
            if (claimedPayment) {
                await Payment.findByIdAndUpdate(claimedPayment._id, { $set: { examAttempt: null } });
            }
            throw createError;
        }

        await logActivity({
            user: userId, email: req.user.email, event: "exam_started",
            metadata: { courseId, courseTitle: course.title, type, attemptId: attempt._id }, req
        });

        res.status(201).json({
            message: "Exam started",
            attempt: {
                _id: attempt._id,

                questions: attemptQuestions.map(q => ({
                    _id: q.question,
                    question: q.questionText,
                    optionA: q.optionA,
                    optionB: q.optionB,
                    optionC: q.optionC,
                    optionD: q.optionD
                })),
                startedAt: attempt.startedAt,
                timeLimit: course.timeLimit,
                type,
                answers: {}
            }
        });

    } catch (error) {
        console.error("Start attempt error:", error);
        res.status(500).json({ message: "Failed to start exam. Please try again." });
    }
};

// ── SAVE ANSWER (AUTO-SAVE) ──
const saveAnswer = async (req, res) => {
    try {
        const { attemptId, questionId, answer } = req.body;

        const attempt = await ExamAttempt.findOne({
            _id: attemptId,
            user: req.user._id,
            status: "in-progress"
        });

        if (!attempt) {
            return res.status(404).json({ message: "Active attempt not found" });
        }

        if (!["A", "B", "C", "D"].includes(answer)) {
            return res.status(400).json({ message: "Invalid answer" });
        }

        attempt.answers.set(questionId, answer);
        await attempt.save();

        res.status(200).json({ message: "Answer saved" });

    } catch (error) {
        console.error("Save answer error:", error);
        res.status(500).json({ message: "Failed to save answer" });
    }
};

// ── SUBMIT ATTEMPT ──
const submitAttempt = async (req, res) => {
    try {
        const { attemptId, answers, status } = req.body;

        const attempt = await ExamAttempt.findOne({
            _id: attemptId,
            user: req.user._id,
            status: "in-progress"
        });

        if (!attempt) {
            return res.status(404).json({ message: "Active attempt not found" });
        }

        const course = await Course.findById(attempt.course);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        const elapsed = (Date.now() - attempt.startedAt) / 1000;
        const timeLimit = course.timeLimit * 60;
        const gracePeriod = 30;

        if (answers && typeof answers === "object") {
            Object.entries(answers).forEach(([questionId, answer]) => {
                if (["A", "B", "C", "D"].includes(answer)) {
                    attempt.answers.set(questionId, answer);
                }
            });
        }

        let correct = 0;
        const reviewQuestions = [];

        attempt.questions.forEach(q => {
            const userAnswer = attempt.answers.get(q.question.toString()) || null;
            const isCorrect = userAnswer === q.correctAnswer;
            if (isCorrect) correct++;

            reviewQuestions.push({
                questionText: q.questionText,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                correctAnswer: q.correctAnswer,
                userAnswer,
                isCorrect,
                explanation: q.explanation
            });
        });

        const totalQuestions = attempt.questions.length;
        const score = totalQuestions > 0
            ? Math.round((correct / totalQuestions) * 100)
            : 0;

        const passed = score >= course.passMark;

        let finalStatus = "submitted";
        if (status === "timed-out" || elapsed > timeLimit + gracePeriod) {
            finalStatus = "timed-out";
        }

        attempt.score = score;
        attempt.passed = passed;
        attempt.status = finalStatus;
        attempt.submittedAt = new Date();
        attempt.timeTaken = Math.floor(elapsed);
        await attempt.save();

        if (attempt.type === "certification") {
            const outcomeEvent = finalStatus === "timed-out"
                ? "exam_timed_out"
                : (passed ? "exam_passed" : "exam_failed");

            await logActivity({
                user: req.user._id, email: req.user.email, event: outcomeEvent,
                metadata: { courseId: course._id, courseTitle: course.title, score, attemptId: attempt._id }, req
            });
        }

        res.status(200).json({
            message: "Exam submitted successfully",
            result: {
                attemptId: attempt._id,
                score,
                passed,
                correct,
                total: totalQuestions,
                passMark: course.passMark,
                status: finalStatus,
                timeTaken: attempt.timeTaken,
                type: attempt.type,
                courseId: course._id,
                courseTitle: course.title,
                review: reviewQuestions
            }
        });

    } catch (error) {
        console.error("Submit attempt error:", error);
        res.status(500).json({ message: "Failed to submit exam. Please try again." });
    }
};

// ── GET ATTEMPT RESULT ──
const getAttemptResult = async (req, res) => {
    try {
        const attempt = await ExamAttempt.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate("course", "title passMark timeLimit");

        if (!attempt) {
            return res.status(404).json({ message: "Attempt not found" });
        }

        if (attempt.status === "in-progress") {
            return res.status(400).json({ message: "Exam is still in progress" });
        }

        const correct = attempt.questions.filter(q => {
            const answer = attempt.answers.get(q.question.toString());
            return answer === q.correctAnswer;
        }).length;

        const reviewQuestions = attempt.questions.map(q => {
            const userAnswer = attempt.answers.get(q.question.toString()) || null;
            return {
                questionText: q.questionText,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                correctAnswer: q.correctAnswer,
                userAnswer,
                isCorrect: userAnswer === q.correctAnswer,
                explanation: q.explanation
            };
        });

        res.status(200).json({
            result: {
                attemptId: attempt._id,
                score: attempt.score,
                passed: attempt.passed,
                correct,
                total: attempt.questions.length,
                passMark: attempt.course.passMark,
                status: attempt.status,
                timeTaken: attempt.timeTaken,
                type: attempt.type,
                courseId: attempt.course._id,
                courseTitle: attempt.course.title,
                submittedAt: attempt.submittedAt,
                review: reviewQuestions
            }
        });

    } catch (error) {
        console.error("Get result error:", error);
        res.status(500).json({ message: "Failed to get result. Please try again." });
    }
};

// ── GET USER ATTEMPTS ──
const getUserAttempts = async (req, res) => {
    try {
        const attempts = await ExamAttempt.find({
            user: req.user._id,
            status: { $in: ["submitted", "timed-out"] }
        })
            .populate("course", "title")
            .sort({ submittedAt: -1 });

        res.status(200).json({ attempts });

    } catch (error) {
        console.error("Get attempts error:", error);
        res.status(500).json({ message: "Failed to get exam history." });
    }
};

module.exports = {
    startAttempt,
    saveAnswer,
    submitAttempt,
    getAttemptResult,
    getUserAttempts
};