const https = require("https");
const { translateError } = require("../utils/errorTranslations");

// Sentry's REST API — fetches recent issues (grouped errors) for the
// configured project, using the personal auth token (server-side only,
// never exposed to the frontend).
const sentryRequest = (path) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "sentry.io",
            path,
            method: "GET",
            headers: {
                Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    reject(new Error("Failed to parse Sentry response"));
                }
            });
        });

        req.on("error", reject);
        req.end();
    });
};

// ── GET RECENT ERRORS (ADMIN) ──
const getRecentErrors = async (req, res) => {
    try {
        const org = process.env.SENTRY_ORG_SLUG;
        const project = process.env.SENTRY_PROJECT_SLUG;

        const path = `/api/0/projects/${org}/${project}/issues/?statsPeriod=14d&query=is:unresolved&sort=freq`;
        const result = await sentryRequest(path);

        if (result.status !== 200) {
            return res.status(502).json({
                message: "Failed to fetch errors from Sentry.",
                detail: result.body
            });
        }

        const errors = result.body.map(issue => {
            const translation = translateError(issue.title, issue.metadata?.value);
            return {
                id: issue.id,
                rawTitle: issue.title,
                count: issue.count,
                userCount: issue.userCount,
                firstSeen: issue.firstSeen,
                lastSeen: issue.lastSeen,
                level: issue.level,
                sentryUrl: issue.permalink,
                plainTitle: translation.title,
                plainExplanation: translation.explanation,
                suggestion: translation.suggestion
            };
        });

        res.status(200).json({ errors, total: errors.length });

    } catch (error) {
        console.error("Get recent errors error:", error);
        res.status(500).json({ message: "Failed to fetch error monitoring data." });
    }
};

module.exports = { getRecentErrors };