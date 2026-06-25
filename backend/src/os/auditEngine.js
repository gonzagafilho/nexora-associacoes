const entries = [];

function recordAudit(entry = {}) {
  const normalized = {
    tenantId: entry.tenantId || null,
    userId: entry.userId || null,
    action: entry.action || "unknown",
    module: entry.module || "system",
    resourceId: entry.resourceId || null,
    status: entry.status || "ok",
    metadata: entry.metadata || {},
    timestamp: new Date().toISOString()
  };

  entries.push(normalized);

  if (entries.length > 1000) {
    entries.shift();
  }

  return { ok: true, entry: normalized };
}

function getAuditStats() {
  const byStatus = {};
  const byModule = {};

  for (const item of entries) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    byModule[item.module] = (byModule[item.module] || 0) + 1;
  }

  return {
    mode: "in-memory",
    total: entries.length,
    byStatus,
    byModule
  };
}

function clearAuditForTest() {
  entries.length = 0;
}

module.exports = {
  recordAudit,
  getAuditStats,
  clearAuditForTest
};
