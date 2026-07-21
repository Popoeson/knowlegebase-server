const archiver = require("archiver");
const User = require("../models/User");
const Course = require("../models/Course");
const Category = require("../models/Category");
const Question = require("../models/Question");
const ExamAttempt = require("../models/ExamAttempt");
const Payment = require("../models/Payment");
const Certificate = require("../models/Certificate");
const ActivityLog = require("../models/ActivityLog");
const BackupLog = require("../models/BackupLog");

const COLLECTIONS = {
    users: User,
    courses: Course,
    categories: Category,
    questions: Question,
    examattempts: ExamAttempt,
    payments: Payment,
    certificates: Certificate,
    activitylogs: ActivityLog
};

// ── BACKUP STATUS ──
const getBackupStatus = async (req, res) => {
    try {
        const lastFull = await BackupLog.findOne({ type: "full" }).sort({ createdAt: -1 });
        const lastAny = await BackupLog.findOne().sort({ createdAt: -1 });

        res.status(200).json({
            lastFullBackup: lastFull ? lastFull.createdAt : null,
            lastBackup: lastAny ? lastAny.createdAt : null,
            lastBackupType: lastAny ? lastAny.type : null
        });

    } catch (error) {
        console.error("Get backup status error:", error);
        res.status(500).json({ message: "Failed to get backup status." });
    }
};

// ── EXPORT BACKUP ──
// mode=full downloads every document in every collection, unconditionally.
// mode=incremental downloads only documents created or modified since the
// last recorded backup of ANY type. IMPORTANT: incremental exports do NOT
// capture deletions — a document removed since the last backup simply
// won't appear here, so incremental exports are a supplement to periodic
// full backups, never a replacement for them.
//
// format=zip packages each collection as its own file inside collections/,
// plus a manifest.json at the root — easier to open, filter, or search a
// single collection than digging through one large JSON blob.
// format=json (default) keeps the original single-file behavior.
const exportBackup = async (req, res) => {
    try {
        const mode = req.query.mode === "incremental" ? "incremental" : "full";
        const format = req.query.format === "zip" ? "zip" : "json";

        let since = null;
        if (mode === "incremental") {
            const lastBackup = await BackupLog.findOne().sort({ createdAt: -1 });
            if (!lastBackup) {
                return res.status(400).json({
                    message: "No previous backup found. Run a full backup first before using incremental export."
                });
            }
            since = lastBackup.createdAt;
        }

        const output = {};
        const documentCounts = {};

        for (const [key, Model] of Object.entries(COLLECTIONS)) {
            const filter = since ? { updatedAt: { $gte: since } } : {};
            const docs = await Model.find(filter).lean();
            output[key] = docs;
            documentCounts[key] = docs.length;
        }

        await BackupLog.create({
            type: mode,
            performedBy: req.user._id,
            collectionsIncluded: Object.keys(COLLECTIONS),
            documentCounts
        });

        const dateStamp = new Date().toISOString().slice(0, 10);

        if (format === "zip") {
            const filename = `asodem-backup-${mode}-${dateStamp}.zip`;
            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

            const archive = archiver("zip", { zlib: { level: 9 } });

            archive.on("error", (err) => {
                console.error("Archive error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ message: "Failed to create backup archive." });
                }
            });

            archive.pipe(res);

            archive.append(
                JSON.stringify({
                    exportedAt: new Date().toISOString(),
                    mode,
                    since: since || null,
                    documentCounts
                }, null, 2),
                { name: "manifest.json" }
            );

            for (const [key, docs] of Object.entries(output)) {
                archive.append(JSON.stringify(docs, null, 2), { name: `collections/${key}.json` });
            }

            await archive.finalize();
            return;
        }

        // Default — single JSON file, unchanged from before
        const filename = `asodem-backup-${mode}-${dateStamp}.json`;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.status(200).send(JSON.stringify({
            exportedAt: new Date().toISOString(),
            mode,
            since: since || null,
            data: output
        }, null, 2));

    } catch (error) {
        console.error("Export backup error:", error);
        res.status(500).json({ message: "Failed to export backup." });
    }
};

module.exports = { getBackupStatus, exportBackup };