const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({ message: "Not authorized. No token provided." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password -otp -otpExpires");
        if (!user) {
            return res.status(401).json({ message: "User no longer exists." });
        }

        // Admins bypass registration payment requirement
        if (user.role !== "admin" && !user.hasPaidRegistration) {
            return res.status(402).json({
                message: "Registration payment required.",
                code: "REGISTRATION_PAYMENT_REQUIRED"
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: "Not authorized. Invalid token." });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Admins only." });
    }
};

// Middleware for routes that only need a valid token
// but should NOT block unpaid users — used for registration payment routes
const protectUnpaid = async (req, res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({ message: "Not authorized. No token provided." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password -otp -otpExpires");
        if (!user) {
            return res.status(401).json({ message: "User no longer exists." });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: "Not authorized. Invalid token." });
    }
};

module.exports = { protect, adminOnly, protectUnpaid };