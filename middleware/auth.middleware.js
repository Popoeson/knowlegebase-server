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

        if (user.isSuspended) {
            return res.status(401).json({
                message: "Account access has been revoked.",
                code: "ACCOUNT_SUSPENDED"
            });
        }

        // Treat a token minted before tokenVersion existed as version 0,
        // so this deploy doesn't force-log-out every currently active session.
        // A real mismatch (post-deploy revoke/role-change) still invalidates correctly.
        const decodedVersion = decoded.tokenVersion || 0;
        if (decodedVersion !== user.tokenVersion) {
            return res.status(401).json({
                message: "Session expired. Please log in again.",
                code: "SESSION_INVALIDATED"
            });
        }

        // Admins and superadmins bypass registration payment requirement
        if (!["admin", "superadmin"].includes(user.role) && !user.hasPaidRegistration) {
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
    if (req.user && ["admin", "superadmin"].includes(req.user.role)) {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Admins only." });
    }
};

const superAdminOnly = (req, res, next) => {
    if (req.user && req.user.role === "superadmin") {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Superadmins only." });
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

        if (user.isSuspended) {
            return res.status(401).json({
                message: "Account access has been revoked.",
                code: "ACCOUNT_SUSPENDED"
            });
        }

        const decodedVersion = decoded.tokenVersion || 0;
        if (decodedVersion !== user.tokenVersion) {
            return res.status(401).json({
                message: "Session expired. Please log in again.",
                code: "SESSION_INVALIDATED"
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: "Not authorized. Invalid token." });
    }
};

module.exports = { protect, adminOnly, superAdminOnly, protectUnpaid };