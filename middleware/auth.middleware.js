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

module.exports = { protect, adminOnly };