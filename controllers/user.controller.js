const User = require("../models/User");
const { uploadToCloudinary } = require("../config/cloudinary");

// ── GET PROFILE ──
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select(
            "-password -otp -otpExpires"
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ user });

    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ message: "Failed to get profile. Please try again." });
    }
};

// ── UPDATE PROFILE ──
const updateProfile = async (req, res) => {
    try {
        const { phone, bio } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update fields
        if (phone !== undefined) user.phone = phone;
        if (bio !== undefined) user.bio = bio;

        // Handle profile photo upload
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: "knowledgebase/profiles",
                transformation: [
                    { width: 400, height: 400, crop: "fill", gravity: "face" }
                ]
            });
            user.profilePhoto = result.secure_url;
        }

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                fullName: user.fullName,
                firstName: user.firstName,
                surname: user.surname,
                otherName: user.otherName,
                email: user.email,
                phone: user.phone,
                bio: user.bio,
                profilePhoto: user.profilePhoto,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ message: "Failed to update profile. Please try again." });
    }
};

// ── CHANGE PASSWORD ──
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: "New passwords do not match" });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({ message: "Password changed successfully" });

    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ message: "Failed to change password. Please try again." });
    }
};

//----- DASHBOARD STATS ----:
const getUserStats = async (req, res) => {
    try {
        const ExamAttempt = require("../models/ExamAttempt");
        const Certificate = require("../models/Certificate");
        const Course = require("../models/Course");

        const userId = req.user._id;

        const totalExams = await ExamAttempt.countDocuments({
            user: userId,
            status: { $in: ["submitted", "timed-out"] }
        });

        const passedExams = await ExamAttempt.countDocuments({
            user: userId,
            status: { $in: ["submitted", "timed-out"] },
            passed: true
        });

        const totalCertificates = await Certificate.countDocuments({
            user: userId,
            status: "active"
        }).catch(() => 0);

        const totalCourses = await Course.countDocuments({ isActive: true });

        res.status(200).json({
            stats: {
                totalExams,
                passedExams,
                totalCertificates,
                totalCourses
            }
        });

    } catch (error) {
        console.error("Get user stats error:", error);
        res.status(500).json({ message: "Failed to get stats." });
    }
};


module.exports = { getProfile, updateProfile, changePassword };
module.exports = { getProfile, updateProfile, changePassword, getUserStats };