const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { generateOTP, sendOTP, sendPasswordResetOTP } = require("../utils/sendOTP");

// ── REGISTER ──
const register = async (req, res) => {
    try {
        const { firstName, otherName, surname, email, password, confirmPassword } = req.body;

        if (!firstName || !surname || !email || !password || !confirmPassword) {
            return res.status(400).json({ message: "All required fields must be filled" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "An account with this email already exists" });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_IN) || 600000));

        const user = await User.create({
            firstName,
            otherName: otherName || "",
            surname,
            email,
            password,
            otp,
            otpExpires
        });

        try {
            await sendOTP(email, user.fullName, otp);
        } catch (emailError) {
            console.error("Email error:", emailError);
            await User.deleteOne({ email });
            return res.status(500).json({
                message: "Account created but we could not send your OTP. Please try again."
            });
        }

        res.status(201).json({
            message: "Registration successful. Please check your email for your OTP.",
            email
        });

    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Registration failed. Please try again." });
    }
};

// ── VERIFY OTP ──
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: "Account is already verified" });
        }

        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (user.otpExpires < new Date()) {
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }

        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        res.status(200).json({ message: "Email verified successfully. You can now log in." });

    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ message: "Verification failed. Please try again." });
    }
};

// ── RESEND OTP ──
const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: "Account is already verified" });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_IN) || 600000));

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        await sendOTP(email, user.fullName, otp);

        res.status(200).json({ message: "A new OTP has been sent to your email." });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ message: "Failed to resend OTP. Please try again." });
    }
};

// ── LOGIN ──
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!user.isVerified) {
            return res.status(401).json({
                message: "Please verify your email before logging in.",
                needsVerification: true,
                email
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = generateToken(user._id, user.role);

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                firstName: user.firstName,
                email: user.email,
                role: user.role,
                profilePhoto: user.profilePhoto,
                hasPaidRegistration: user.hasPaidRegistration
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed. Please try again." });
    }
};

// ── FORGOT PASSWORD ──
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({
                message: "If an account exists with this email, an OTP has been sent."
            });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_IN) || 600000));

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        await sendPasswordResetOTP(email, user.fullName, otp);

        res.status(200).json({
            message: "If an account exists with this email, an OTP has been sent.",
            email
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Failed to process request. Please try again." });
    }
};

// ── RESET PASSWORD ──
const resetPassword = async (req, res) => {
    try {
        const { email, otp, password, confirmPassword } = req.body;

        if (!email || !otp || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (user.otpExpires < new Date()) {
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }

        user.password = password;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        res.status(200).json({ message: "Password reset successful. You can now log in." });

    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Password reset failed. Please try again." });
    }
};

// ── ME — Restore session silently ──
// Called when a new tab opens and sessionStorage is empty
// but localStorage has a persisted token
const me = async (req, res) => {
    try {
        const user = req.user;

        res.status(200).json({
            token: req.headers.authorization.split(" ")[1],
            user: {
                id: user._id,
                fullName: user.fullName,
                firstName: user.firstName,
                email: user.email,
                role: user.role,
                profilePhoto: user.profilePhoto,
                hasPaidRegistration: user.hasPaidRegistration
            }
        });

    } catch (error) {
        console.error("Me error:", error);
        res.status(500).json({ message: "Failed to restore session." });
    }
};

module.exports = {
    register,
    verifyOTP,
    resendOTP,
    login,
    forgotPassword,
    resetPassword,
    me
};