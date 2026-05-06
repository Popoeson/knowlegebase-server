// Simple in-memory cache with TTL (time-to-live)
// No Redis needed at this scale. Resets when server restarts (acceptable for MVP).

const store = {};

const Cache = {

    // Store a value with a TTL in seconds
    set(key, value, ttlSeconds = 600) {
        store[key] = {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000
        };
    },

    // Retrieve a value — returns null if missing or expired
    get(key) {
        const entry = store[key];
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            delete store[key];
            return null;
        }
        return entry.value;
    },

    // Remove a specific key
    invalidate(key) {
        delete store[key];
    },

    // Remove all keys that start with a given prefix
    // e.g. Cache.invalidatePattern("course:") clears all course detail caches
    invalidatePattern(prefix) {
        Object.keys(store).forEach(key => {
            if (key.startsWith(prefix)) delete store[key];
        });
    }
};

module.exports = Cache;