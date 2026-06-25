const { randomUUID } = require("node:crypto");

const ALLOWED_TYPES = new Set(["user", "ai", "workflow", "push", "system"]);
const sessionsStore = new Map();

function normalizeType(type) {
  const normalized = String(type || "").toLowerCase().trim();
  return ALLOWED_TYPES.has(normalized) ? normalized : "system";
}

function createSession(type, data = {}) {
  const sessionType = normalizeType(type);
  const now = new Date().toISOString();
  const sessionId = randomUUID();
  const session = {
    sessionId,
    type: sessionType,
    status: "active",
    data: data && typeof data === "object" ? { ...data } : {},
    createdAt: now,
    updatedAt: now,
    closedAt: null
  };
  sessionsStore.set(sessionId, session);
  return { ...session };
}

function getSession(sessionId) {
  const key = String(sessionId || "").trim();
  if (!key || !sessionsStore.has(key)) return null;
  return { ...sessionsStore.get(key) };
}

function updateSession(sessionId, patch = {}) {
  const key = String(sessionId || "").trim();
  if (!key || !sessionsStore.has(key)) return null;
  const current = sessionsStore.get(key);
  const next = {
    ...current,
    data: {
      ...(current.data || {}),
      ...(patch && typeof patch === "object" ? patch : {})
    },
    updatedAt: new Date().toISOString()
  };
  sessionsStore.set(key, next);
  return { ...next };
}

function closeSession(sessionId) {
  const key = String(sessionId || "").trim();
  if (!key || !sessionsStore.has(key)) return null;
  const current = sessionsStore.get(key);
  const closedAt = new Date().toISOString();
  const next = {
    ...current,
    status: "closed",
    closedAt,
    updatedAt: closedAt
  };
  sessionsStore.set(key, next);
  return { ...next };
}

function listSessions(filter = {}) {
  const type = filter?.type ? normalizeType(filter.type) : "";
  const status = filter?.status ? String(filter.status).toLowerCase().trim() : "";
  const tenantId = filter?.tenantId ? String(filter.tenantId).trim() : "";

  return [...sessionsStore.values()]
    .filter((item) => {
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (tenantId && String(item.data?.tenantId || "") !== tenantId) return false;
      return true;
    })
    .map((item) => ({ ...item }));
}

function stats() {
  const list = [...sessionsStore.values()];
  const active = list.filter((item) => item.status === "active").length;
  return {
    total: list.length,
    active,
    closed: list.length - active,
    byType: {
      user: list.filter((item) => item.type === "user").length,
      ai: list.filter((item) => item.type === "ai").length,
      workflow: list.filter((item) => item.type === "workflow").length,
      push: list.filter((item) => item.type === "push").length,
      system: list.filter((item) => item.type === "system").length
    }
  };
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  closeSession,
  listSessions,
  stats
};
