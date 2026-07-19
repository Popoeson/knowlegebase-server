// Sentry must be initialized before express (or anything that requires
// express) is loaded anywhere in the app — its auto-instrumentation hooks
// into Node's module loader, which only works if this runs first. This is
// why this lives in its own file, required as literally the first line of
// server.js, before express or any route file is touched.
require("dotenv").config();
const Sentry = require("@sentry/node");

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1 // captures 10% of requests for performance data, keeps free-tier quota healthy
});