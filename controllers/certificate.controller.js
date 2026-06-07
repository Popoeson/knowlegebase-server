const Certificate = require("../models/Certificate");
const ExamAttempt = require("../models/ExamAttempt");
const Course = require("../models/Course");
const User = require("../models/User");
const Payment = require("../models/Payment");
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
const generateCertificatePDF = async (user, course, certificate) => {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    const issuedDate = new Date(certificate.issuedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    const verifyUrl = `https://knowlegebase-client.vercel.app/pages/verify.html?id=${certificate.certificateId}`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    width: 1122px; height: 794px;
                    background-color: #FFFDF5;
                    font-family: 'Arial', sans-serif;
                    overflow: hidden;
                }
                .certificate {
                    width: 1122px; height: 794px;
                    background-color: #FFFDF5;
                    border: 6px solid #C9A84C;
                    position: relative;
                    display: flex; flex-direction: column;
                }
                .inner-border {
                    position: absolute; inset: 12px;
                    border: 1.5px solid #C9A84C;
                    pointer-events: none; z-index: 1;
                }
                .cert-header {
                    background: linear-gradient(135deg, #1B3A6B 0%, #2A5298 100%);
                    padding: 28px 60px; text-align: center;
                    position: relative; flex-shrink: 0;
                }
                .cert-header::after {
                    content: ""; position: absolute;
                    bottom: 0; left: 0; right: 0; height: 4px;
                    background: linear-gradient(90deg, #C9A84C, #F0D080, #C9A84C);
                }
                .cert-brand {
                    font-size: 36px; font-weight: bold;
                    color: #C9A84C; letter-spacing: 6px; margin-bottom: 4px;
                }
                .cert-authority {
                    font-size: 13px; color: rgba(255,255,255,0.85);
                    letter-spacing: 4px; text-transform: uppercase;
                }
                .cert-body {
                    flex: 1; display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    padding: 30px 80px; text-align: center; position: relative;
                }
                .cert-watermark {
                    position: absolute; font-size: 160px; font-weight: bold;
                    color: rgba(201, 168, 76, 0.05); letter-spacing: 10px;
                    user-select: none; pointer-events: none;
                }
                .cert-achievement-title {
                    font-size: 16px; font-weight: bold; color: #8B6914;
                    letter-spacing: 5px; text-transform: uppercase; margin-bottom: 18px;
                }
                .cert-achievement-title::before,
                .cert-achievement-title::after { content: " ✦ "; color: #C9A84C; }
                .cert-certifies { font-size: 14px; color: #666; margin-bottom: 10px; }
                .cert-name {
                    font-family: 'Georgia', serif; font-size: 48px;
                    font-weight: bold; color: #1B3A6B;
                    margin-bottom: 6px; line-height: 1.1;
                }
                .cert-name-underline {
                    width: 360px; height: 2px;
                    background: linear-gradient(90deg, transparent, #C9A84C, transparent);
                    margin: 0 auto 18px;
                }
                .cert-completed-text { font-size: 14px; color: #666; margin-bottom: 8px; }
                .cert-course-name { font-size: 24px; font-weight: bold; color: #1B3A6B; margin-bottom: 20px; }
                .cert-divider { display: flex; align-items: center; gap: 12px; width: 100%; margin: 10px 0; }
                .cert-divider-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #C9A84C, transparent); }
                .cert-divider-diamond { color: #C9A84C; font-size: 18px; }
                .cert-footer {
                    display: flex; justify-content: space-between;
                    align-items: center; width: 100%; padding: 0 20px; margin-top: 14px;
                }
                .cert-footer-item { text-align: center; min-width: 160px; }
                .cert-footer-label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
                .cert-footer-value { font-size: 13px; font-weight: bold; color: #2C2C2C; }
                .cert-seal {
                    width: 88px; height: 88px; border: 3px solid #C9A84C;
                    border-radius: 50%; display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    background: radial-gradient(circle, rgba(201,168,76,0.1), transparent);
                }
                .cert-seal-text { font-size: 8px; font-weight: bold; color: #C9A84C; text-transform: uppercase; letter-spacing: 1px; text-align: center; line-height: 1.6; }
                .cert-bottom-band {
                    background: linear-gradient(90deg, #C9A84C, #F0D080, #C9A84C);
                    padding: 10px 40px; text-align: center; flex-shrink: 0;
                }
                .cert-verify-url { font-size: 11px; color: #1B3A6B; font-weight: bold; letter-spacing: 0.5px; }
            </style>
        </head>
        <body>
            <div class="certificate">
                <div class="inner-border"></div>
                <div class="cert-header">
                    <div class="cert-brand">KNOWLEDGEBASE</div>
                    <div class="cert-authority">Certification Authority</div>
                </div>
                <div class="cert-body">
                    <div class="cert-watermark">KB</div>
                    <div class="cert-achievement-title">Certificate of Achievement</div>
                    <p class="cert-certifies">This certifies that</p>
                    <h2 class="cert-name">${user.fullName}</h2>
                    <div class="cert-name-underline"></div>
                    <p class="cert-completed-text">has successfully completed and passed the certification exam in</p>
                    <h3 class="cert-course-name">${course.title}</h3>
                    <div class="cert-divider">
                        <div class="cert-divider-line"></div>
                        <div class="cert-divider-diamond">◆</div>
                        <div class="cert-divider-line"></div>
                    </div>
                    <div class="cert-footer">
                        <div class="cert-footer-item">
                            <p class="cert-footer-label">Date Issued</p>
                            <p class="cert-footer-value">${issuedDate}</p>
                        </div>
                        <div class="cert-seal">
                            <div class="cert-seal-text">✦<br>VERIFIED<br>KNOWLEDGEBASE<br>✦</div>
                        </div>
                        <div class="cert-footer-item">
                            <p class="cert-footer-label">Certificate ID</p>
                            <p class="cert-footer-value">${certificate.certificateId}</p>
                        </div>
                    </div>
                </div>
                <div class="cert-bottom-band">
                    <p class="cert-verify-url">Verify at: ${verifyUrl}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1122, height: 794 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
        width: "1122px",
        height: "794px",
        printBackground: true,
        pageRanges: "1"
    });

    await browser.close();
    return pdfBuffer;
};

// ── GENERATE CERTIFICATE ──
const generateCertificate = async (req, res) => {
    try {
        const { attemptId } = req.body;
        const userId = req.user._id;

        if (!attemptId) {
            return res.status(400).json({ message: "Exam attempt ID is required" });
        }

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

        // Verify certificate payment for this specific attempt
        const payment = await Payment.findOne({
            examAttempt: attemptId,
            user: userId,
            type: "certificate",
            status: "success"
        });

        if (!payment) {
            return res.status(402).json({
                message: "Payment required to generate certificate.",
                code: "CERTIFICATE_PAYMENT_REQUIRED",
                attemptId
            });
        }

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

        const certificate = await Certificate.create({
            user: userId,
            course: course._id,
            examAttempt: attemptId,
            certificateId,
            issuedAt: new Date()
        });

        const pdfBuffer = await generateCertificatePDF(user, course, certificate);

        const uploadResult = await uploadToCloudinary(pdfBuffer, {
            folder: "knowledgebase/certificates",
            resource_type: "raw",
            type: "upload",
            access_mode: "public",
            format: "pdf",
            public_id: `certificate_${certificateId}`
        });

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
            .populate("user", "firstName otherName surname email")
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