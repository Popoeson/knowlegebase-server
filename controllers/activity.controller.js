const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");

// ── AGGREGATED STATS (funnels, difficulty signals) ──
const getActivityStats = async (req, res) => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

        // Registration → activation funnel
        const registered = await ActivityLog.countDocuments({ event: "user_registered", createdAt: { $gte: since } });
        const activated = await ActivityLog.countDocuments({ event: "registration_payment_verified", createdAt: { $gte: since } });

        // Payment funnels (initialized vs verified, per type)
        const certInitialized = await ActivityLog.countDocuments({ event: "certificate_payment_initialized", createdAt: { $gte: since } });
        const certVerified = await ActivityLog.countDocuments({ event: "certificate_payment_verified", createdAt: { $gte: since } });

        // Exam outcomes, grouped by course
        const examOutcomes = await ActivityLog.aggregate([
            { $match: { event: { $in: ["exam_passed", "exam_failed", "exam_timed_out"] }, createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { course: "$metadata.courseTitle", event: "$event" },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Reshape into { courseTitle: { passed, failed, timedOut } }
        const courseOutcomes = {};
        examOutcomes.forEach(row => {
            const course = row._id.course || "Unknown course";
            if (!courseOutcomes[course]) courseOutcomes[course] = { passed: 0, failed: 0, timedOut: 0 };
            if (row._id.event === "exam_passed") courseOutcomes[course].passed = row.count;
            if (row._id.event === "exam_failed") courseOutcomes[course].failed = row.count;
            if (row._id.event === "exam_timed_out") courseOutcomes[course].timedOut = row.count;
        });

        // Difficulty signals — users showing repeated friction
        const repeatedFailedLogins = await ActivityLog.aggregate([
            { $match: { event: "login_failed", createdAt: { $gte: since } } },
            { $group: { _id: "$email", count: { $sum: 1 } } },
            { $match: { count: { $gte: 3 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);

        const repeatedExamFailures = await ActivityLog.aggregate([
            { $match: { event: "exam_failed", createdAt: { $gte: since } } },
            { $group: { _id: { user: "$user", course: "$metadata.courseTitle" }, count: { $sum: 1 } } },
            { $match: { count: { $gte: 2 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);

        const abandonedPayments = await ActivityLog.aggregate([
            { $match: { event: { $in: ["certificate_payment_initialized", "certificate_payment_verified"] }, createdAt: { $gte: since } } },
            {
                $group: {
                    _id: "$user",
                    initialized: { $sum: { $cond: [{ $eq: ["$event", "certificate_payment_initialized"] }, 1, 0] } },
                    verified: { $sum: { $cond: [{ $eq: ["$event", "certificate_payment_verified"] }, 1, 0] } }
                }
            },
            { $match: { $expr: { $and: [{ $gte: ["$initialized", 2] }, { $eq: ["$verified", 0] }] } } },
            { $limit: 20 }
        ]);

        res.status(200).json({
            periodDays: 30,
            funnel: {
                registered,
                activated,
                certPaymentInitialized: certInitialized,
                certPaymentVerified: certVerified
            },
            courseOutcomes,
            difficultySignals: {
                repeatedFailedLogins,
                repeatedExamFailures,
                abandonedPayments
            }
        });

    } catch (error) {
        console.error("Get activity stats error:", error);
        res.status(500).json({ message: "Failed to get activity stats." });
    }
};

// ── RAW ACTIVITY FEED (filterable, paginated) ──
const getActivityFeed = async (req, res) => {
    try {
        const { event, search, page = 1, limit = 50 } = req.query;

        const filter = {};
        if (event) filter.event = event;
        if (search) filter.email = { $regex: String(search).trim(), $options: "i" };

        const skip = (Number(page) - 1) * Number(limit);

        const [entries, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate("user", "firstName surname email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            ActivityLog.countDocuments(filter)
        ]);

        res.status(200).json({ entries, total, page: Number(page), limit: Number(limit) });

    } catch (error) {
        console.error("Get activity feed error:", error);
        res.status(500).json({ message: "Failed to get activity feed." });
    }
};

// ── ONE USER'S FULL TIMELINE ──
const getUserActivity = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("firstName surname email");
        if (!user) return res.status(404).json({ message: "User not found" });

        const entries = await ActivityLog.find({ user: req.params.userId })
            .sort({ createdAt: -1 })
            .limit(200);

        res.status(200).json({ user, entries });

    } catch (error) {
        console.error("Get user activity error:", error);
        res.status(500).json({ message: "Failed to get user activity." });
    }
};

module.exports = { getActivityStats, getActivityFeed, getUserActivity };