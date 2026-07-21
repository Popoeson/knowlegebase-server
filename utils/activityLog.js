const ActivityLog = require("../models/ActivityLog");

// Fire-and-forget logging — never let a logging failure break the actual
// request it's attached to. Called from existing controllers at
// meaningful points without changing their response behavior.
const logActivity = async ({ user = null, email = null, event, metadata = {}, req = null }) => {
    try {
        await ActivityLog.create({
            user,
            email,
            event,
            metadata,
            ip: req ? req.ip : null
        });
    } catch (err) {
        console.error("Activity log error:", err.message);
    }
};

module.exports = { logActivity };