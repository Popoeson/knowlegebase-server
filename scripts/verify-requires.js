// Walks every route file and requires it. If a route file imports a
// controller function that doesn't actually exist in that controller's
// module.exports — e.g. because only the controller got pushed and the
// matching route update didn't land — requiring it throws here, in CI,
// instead of silently deploying a broken route to production.
//
// This targets a specific documented incident: a route file update once
// didn't make it to staging while its controller did, causing silent 404s
// that were only caught by manually comparing exports against routes.

const fs = require("fs");
const path = require("path");

const routesDir = path.join(__dirname, "..", "routes");

let hasError = false;

const files = fs.readdirSync(routesDir).filter(f => f.endsWith(".js"));

console.log(`Checking ${files.length} route file(s)...\n`);

for (const file of files) {
    const fullPath = path.join(routesDir, file);
    try {
        require(fullPath);
        console.log(`  OK   ${file}`);
    } catch (err) {
        hasError = true;
        console.error(`  FAIL ${file}`);
        console.error(`       ${err.message}\n`);
    }
}

if (hasError) {
    console.error("\nOne or more route files failed to load. See errors above.");
    process.exit(1);
} else {
    console.log("\nAll route files loaded successfully.");
    process.exit(0);
}