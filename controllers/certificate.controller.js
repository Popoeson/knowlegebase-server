const Certificate = require("../models/Certificate");
const ExamAttempt = require("../models/ExamAttempt");
const Course = require("../models/Course");
const User = require("../models/User");
const PDFDocument = require("pdfkit");
const { uploadToCloudinary } = require("../config/cloudinary");

// ── GENERATE CERTIFICATE ID ──
const generateCertificateId = () => {
    const year = new Date().getFullYear();
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let random = "";
    for (let i = 0; i < 5; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `KB-${year}-${random}`;
};

// ── GENERATE PDF ──
const generateCertificatePDF = (user, course, certificate) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            layout: "landscape",
            size: "A4",
            margin: 0
        });

        const chunks = [];
        doc.on("data", chunk => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const width = doc.page.width;
        const height = doc.page.height;

        // ── BACKGROUND ──
        doc.rect(0, 0, width, height).fill("#FFFDF5");

        // ── OUTER GOLD BORDER ──
        doc.rect(20, 20, width - 40, height - 40)
            .lineWidth(4)
            .stroke("#C9A84C");

        // ── INNER GOLD BORDER ──
        doc.rect(30, 30, width - 60, height - 60)
            .lineWidth(1)
            .stroke("#C9A84C");

        // ── HEADER BAND ──
        doc.rect(20, 20, width - 40, 90)
            .fill("#1B3A6B");

        // ── BRAND NAME IN HEADER ──
        doc.font("Helvetica-Bold")
            .fontSize(28)
            .fillColor("#C9A84C")
            .text("KNOWLEDGEBASE", 0, 38, { align: "center" });

        // ── HEADER SUBTITLE ──
        doc.font("Helvetica")
            .fontSize(11)
            .fillColor("#FFFFFF")
            .text("Certification Authority", 0, 72, { align: "center" });

        // ── GOLD DECORATIVE LINE UNDER HEADER ──
        doc.moveTo(80, 115)
            .lineTo(width - 80, 115)
            .lineWidth(1.5)
            .stroke("#C9A84C");

        // ── CERTIFICATE OF ACHIEVEMENT ──
        doc.font("Helvetica")
            .fontSize(13)
            .fillColor("#8B6914")
            .text("C E R T I F I C A T E   O F   A C H I E V E M E N T", 0, 128, { align: "center" });

        // ── THIS CERTIFIES THAT ──
        doc.font("Helvetica")
            .fontSize(12)
            .fillColor("#555555")
            .text("This certifies that", 0, 168, { align: "center" });

        // ── USER FULL NAME ──
        doc.font("Helvetica-Bold")
            .fontSize(36)
            .fillColor("#1B3A6B")
            .text(user.fullName, 0, 192, { align: "center" });

        // ── GOLD LINE UNDER NAME ──
        const nameWidth = Math.min(user.fullName.length * 18, 400);
        const nameX = (width - nameWidth) / 2;
        doc.moveTo(nameX, 240)
            .lineTo(nameX + nameWidth, 240)
            .lineWidth(1)
            .stroke("#C9A84C");

        // ── HAS SUCCESSFULLY COMPLETED ──
        doc.font("Helvetica")
            .fontSize(12)
            .fillColor("#555555")
            .text("has successfully completed and passed the certification exam in", 0, 256, { align: "center" });

        // ── COURSE NAME ──
        doc.font("Helvetica-Bold")
            .fontSize(20)
            .fillColor("#1B3A6B")
            .text(course.title, 0, 282, { align: "center" });

        // ── GOLD DECORATIVE LINE ──
        doc.moveTo(80, 325)
            .lineTo(width - 80, 325)
            .lineWidth(1)
            .stroke("#C9A84C");

        // ── DATE AND CERTIFICATE ID ROW ──
        const issuedDate = new Date(certificate.issuedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });

        // Left: Date
        doc.font("Helvetica")
            .fontSize(10)
            .fillColor("#888888")
            .text("DATE ISSUED", 80, 338);

        doc.font("Helvetica-Bold")
            .fontSize(12)
            .fillColor("#2C2C2C")
            .text(issuedDate, 80, 352);

        // Center: Seal placeholder
        doc.circle(width / 2, 352, 28)
            .lineWidth(2)
            .stroke("#C9A84C");

        doc.font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#C9A84C")
            .text("VERIFIED", width / 2 - 18, 347);

        doc.font("Helvetica")
            .fontSize(6)
            .fillColor("#C9A84C")
            .text("KNOWLEDGEBASE", width / 2 - 22, 357);

        // Right: Certificate ID
        doc.font("Helvetica")
            .fontSize(10)
            .fillColor("#888888")
            .text("CERTIFICATE ID", width - 200, 338, { width: 120, align: "right" });

        doc.font("Helvetica-Bold")
            .fontSize(12)
            .fillColor("#2C2C2C")
            .text(certificate.certificateId, width - 200, 352, { width: 120, align: "right" });

        // ── VERIFICATION URL ──
        doc.font("Helvetica")
            .fontSize(9)
            .fillColor("#888888")
            .text(
                `Verify this certificate at: https://knowledgebase.vercel.app/pages/verify.html?id=${certificate.certificateId}`,
                0, 395,
                { align: "center" }
            );

        // ── BOTTOM GOLD LINE ──
        doc.moveTo(20, height - 45)
            .lineTo(width - 20, height - 45)
            .lineWidth(3)
            .stroke("#C9A84C");

        doc.end();
    });
};

// ── GENERATE CERTIFICATE ──
const generateCertificate = async (req, res) => {
    try {
        const { attemptId } = req.body;
        const userId = req.user._id;

        if (!attemptId) {
            return res.status(400).json({ message: "Exam attempt ID is required" });
        }

        // Find the attempt
        const attempt = await ExamAttempt.findOne({
            _id: attemptId,
            user: userId,
            type: "certification",
            passed: true,
            status: { $in: ["submitted", "timed-out"] }
        });

        if (!attempt) {
            return res.status(404).json({
                message: "No passing certification attempt found"
            });
        }

        // Check if certificate already exists for this attempt
        const existing = await Certificate.findOne({
            examAttempt: attemptId,
            user: userId
        });

        if (existing) {
            await existing.populate("course", "title");
            return res.status(200).json({
                message: "Certificate already exists",
                certificate: existing
            });
        }

        // Get course and user details
        const course = await Course.findById(attempt.course);
        const user = await User.findById(userId);

        if (!course || !user) {
            return res.status(404).json({ message: "Course or user not found" });
        }

        // Generate unique certificate ID
        let certificateId;
        let isUnique = false;
        while (!isUnique) {
            certificateId = generateCertificateId();
            const exists = await Certificate.findOne({ certificateId });
            if (!exists) isUnique = true;
        }

        // Create certificate record first
        const certificate = await Certificate.create({
            user: userId,
            course: course._id,
            examAttempt: attemptId,
            certificateId,
            issuedAt: new Date()
        });

        // Generate PDF
        const pdfBuffer = await generateCertificatePDF(user, course, certificate);

        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(pdfBuffer, {
            folder: "knowledgebase/certificates",
            resource_type: "raw",
            format: "pdf",
            public_id: `certificate_${certificateId}`
        });

        // Save PDF URL
        certificate.pdfUrl = uploadResult.secure_url;
        await certificate.save();

        await certificate.populate("course", "title");

        res.status(201).json({
            message: "Certificate generated successfully",
            certificate
        });

    } catch (error) {
        console.error("Generate certificate error:", error);
        res.status(500).json({ message: "Failed to generate certificate. Please try again." });
    }
};

// ── GET USER CERTIFICATES ──
const getUserCertificates = async (req, res) => {
    try {
        const certificates = await Certificate.find({
            user: req.user._id,
            status: "active"
        })
            .populate("course", "title category")
            .sort({ issuedAt: -1 });

        res.status(200).json({ certificates });

    } catch (error) {
        console.error("Get certificates error:", error);
        res.status(500).json({ message: "Failed to get certificates." });
    }
};

// ── GET SINGLE CERTIFICATE ──
const getCertificate = async (req, res) => {
    try {
        const certificate = await Certificate.findOne({
            _id: req.params.id,
            user: req.user._id
        })
            .populate("course", "title category")
            .populate("user", "firstName surname otherName");

        if (!certificate) {
            return res.status(404).json({ message: "Certificate not found" });
        }

        res.status(200).json({ certificate });

    } catch (error) {
        console.error("Get certificate error:", error);
        res.status(500).json({ message: "Failed to get certificate." });
    }
};

// ── VERIFY CERTIFICATE (PUBLIC) ──
const verifyCertificate = async (req, res) => {
    try {
        const { certificateId } = req.params;

        const certificate = await Certificate.findOne({ certificateId })
            .populate("user", "firstName surname otherName")
            .populate("course", "title category");

        if (!certificate) {
            return res.status(200).json({
                valid: false,
                message: "Certificate not found"
            });
        }

        const issuedDate = new Date(certificate.issuedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });

        res.status(200).json({
            valid: certificate.status === "active",
            status: certificate.status,
            certificateId: certificate.certificateId,
            fullName: `${certificate.user.firstName}${certificate.user.otherName ? " " + certificate.user.otherName : ""} ${certificate.user.surname}`,
            course: certificate.course.title,
            issuedAt: issuedDate,
            message: certificate.status === "active"
                ? "This certificate is valid and authentic"
                : "This certificate has been revoked"
        });

    } catch (error) {
        console.error("Verify certificate error:", error);
        res.status(500).json({ message: "Failed to verify certificate." });
    }
};

// ── GET ALL CERTIFICATES (ADMIN) ──
const getAllCertificates = async (req, res) => {
    try {
        const certificates = await Certificate.find()
            .populate("user", "fullName email")
            .populate("course", "title")
            .sort({ issuedAt: -1 });

        res.status(200).json({ certificates });

    } catch (error) {
        console.error("Get all certificates error:", error);
        res.status(500).json({ message: "Failed to get certificates." });
    }
};

// ── REVOKE CERTIFICATE (ADMIN) ──
const revokeCertificate = async (req, res) => {
    try {
        const certificate = await Certificate.findById(req.params.id);

        if (!certificate) {
            return res.status(404).json({ message: "Certificate not found" });
        }

        certificate.status = certificate.status === "active" ? "revoked" : "active";
        await certificate.save();

        res.status(200).json({
            message: `Certificate ${certificate.status === "active" ? "reinstated" : "revoked"} successfully`,
            status: certificate.status
        });

    } catch (error) {
        console.error("Revoke certificate error:", error);
        res.status(500).json({ message: "Failed to update certificate status." });
    }
};

module.exports = {
    generateCertificate,
    getUserCertificates,
    getCertificate,
    verifyCertificate,
    getAllCertificates,
    revokeCertificate
};