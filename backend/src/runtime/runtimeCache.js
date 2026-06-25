const SENSITIVE_KEYS = new Set([
  "token",
  "secret",
  "password",
  "authorization",
  "accesstoken",
  "refreshtoken"
]);

const cacheStore = new Map();

function nowMs() {
  return Date.now();
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value !== "object") return value;

  const sanitized = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;
    sanitized[key] = sanitizeValue(nested);
  }
  return sanitized;
}

function purgeExpired() {
  const current = nowMs();
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt && entry.expiresAt <= current) {
      cacheStore.delete(key);
    }
  }
}

function set(key, value, ttlSeconds) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;

  const ttl = Number(ttlSeconds);
  const hasTtl = Number.isFinite(ttl) && ttl > 0;
  cacheStore.set(normalizedKey, {
    value: sanitizeValue(value),
    createdAt: nowMs(),
    expiresAt: hasTtl ? nowMs() + ttl * 1000 : null
  });
  return true;
}

function get(key) {
  purgeExpired();
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || !cacheStore.has(normalizedKey)) return null;
  return cacheStore.get(normalizedKey).value;
}

function del(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;
  return cacheStore.delete(normalizedKey);
}

function clear() {
  const count = cacheStore.size;
  cacheStore.clear();
  return count;
}

function stats() {
  purgeExpired();
  let withTtl = 0;
  for (const entry of cacheStore.values()) {
    if (entry.expiresAt) withTtl += 1;
  }
  return {
    total: cacheStore.size,
    withTtl,
    persistent: cacheStore.size - withTtl
  };
}

module.exports = {
  set,
  get,
  del,
  clear,
  stats
};
