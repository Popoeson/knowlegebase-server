// scripts/backup.js
// AKOWE — MongoDB Backup Script
// Dumps 5 critical collections from Atlas and pushes
// compressed JSON to the akowe-backups private GitHub repo.
// Triggered by GitHub Actions on a nightly schedule.

const { MongoClient } = require("mongodb");
const https = require("https");
const zlib = require("zlib");

// ── Config ────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN;
const GITHUB_OWNER = "Popoeson";
const BACKUP_REPO = "akowe-backups";
const DB_NAME = "elibrary";
const COLLECTIONS = [
  "users",
  "books",
  "purchases",
  "authorapplications",
  "platformsettings",
];

// ── Helpers ───────────────────────────────────────────────────

function log(msg, data = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data);
}

function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "akowe-backup-script",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(payload && { "Content-Length": Buffer.byteLength(payload) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getExistingFileSha(filePath) {
  const res = await githubRequest(
    "GET",
    `/repos/${GITHUB_OWNER}/${BACKUP_REPO}/contents/${filePath}`
  );
  if (res.status === 200 && res.body?.sha) return res.body.sha;
  return null;
}

async function pushToGitHub(filePath, content, dateLabel) {
  // Compress content
  const compressed = await new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(JSON.stringify(content)), (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });

  const base64Content = compressed.toString("base64");
  const sha = await getExistingFileSha(filePath);

  const body = {
    message: `backup: ${dateLabel}`,
    content: base64Content,
    ...(sha && { sha }), // required by GitHub API to update existing file
  };

  const res = await githubRequest(
    "PUT",
    `/repos/${GITHUB_OWNER}/${BACKUP_REPO}/contents/${filePath}`,
    body
  );

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `GitHub push failed for ${filePath}: ${JSON.stringify(res.body)}`
    );
  }

  return compressed.length;
}

// ── Main ──────────────────────────────────────────────────────

async function runBackup() {
  if (!MONGO_URI) {
    log("ERROR: MONGO_URI not set — aborting");
    process.exit(1);
  }

  if (!GITHUB_TOKEN) {
    log("ERROR: GITHUB_BACKUP_TOKEN not set — aborting");
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  const results = [];
  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeLabel = now.toISOString().slice(0, 19).replace(/:/g, "-"); // YYYY-MM-DDTHH-MM-SS

  log("AKOWE backup started", { date: dateLabel });

  try {
    await client.connect();
    log("Connected to MongoDB Atlas");

    const db = client.db(DB_NAME);

    for (const collectionName of COLLECTIONS) {
      try {
        log(`Dumping collection: ${collectionName}`);
        const docs = await db.collection(collectionName).find({}).toArray();

        const filePath = `backups/${dateLabel}/${collectionName}.json.gz`;
        const sizeBytes = await pushToGitHub(filePath, docs, dateLabel);

        log(`✓ ${collectionName}: ${docs.length} docs, ${(sizeBytes / 1024).toFixed(1)}kb compressed`);
        results.push({ collection: collectionName, docs: docs.length, sizeBytes, status: "ok" });
      } catch (err) {
        log(`✗ ${collectionName} failed: ${err.message}`);
        results.push({ collection: collectionName, status: "failed", error: err.message });
      }
    }

    // Push a manifest file so you can see what each backup contains at a glance
    const manifest = {
      timestamp: now.toISOString(),
      database: DB_NAME,
      collections: results,
    };

    await pushToGitHub(
      `backups/${dateLabel}/manifest.json`,
      manifest,
      dateLabel
    );

    log("Manifest written");

    // Summary
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      log(`Backup completed with ${failed.length} failure(s)`, failed);
      process.exit(1); // GitHub Actions will mark the run as failed
    } else {
      log("Backup completed successfully", { collections: results.length });
      process.exit(0);
    }
  } catch (err) {
    log("FATAL backup error", { error: err.message });
    process.exit(1);
  } finally {
    await client.close();
  }
}

runBackup();