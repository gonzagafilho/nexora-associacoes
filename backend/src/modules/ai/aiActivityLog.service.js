const AiActivityLog = require("./aiActivityLog.model");
const mongoose = require("mongoose");

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function normalizeString(value, maxLength = 8000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMemoryIds(values = []) {
  const source = Array.isArray(values) ? values : [];
  return Array.from(new Set(source.map((item) => normalizeString(item, 120)).filter(Boolean))).slice(0, 100);
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase() === "error" ? "error" : "success";
}

function normalizeDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function serialize(log) {
  if (!log) return null;
  return {
    id: String(log._id),
    tenantId: String(log.tenantId),
    userId: log.userId ? String(log.userId) : "",
    projectKey: log.projectKey || "associacoes",
    module: log.module || "NEXORA IA",
    action: log.action || "assistant.message",
    question: log.question || "",
    answer: log.answer || "",
    memoryIds: Array.isArray(log.memoryIds) ? log.memoryIds : [],
    memoryCount: Number(log.memoryCount || 0),
    memoryContextPreview: log.memoryContextPreview || "",
    status: log.status || "success",
    errorMessage: log.errorMessage || "",
    durationMs: Number(log.durationMs || 0),
    metadata: log.metadata || {},
    createdAt: log.createdAt || null
  };
}

function buildFilter({ tenantId, query = {} }) {
  const filter = { tenantId };

  if (query.projectKey) filter.projectKey = normalizeString(query.projectKey, 120).toLowerCase();
  if (query.status) filter.status = normalizeStatus(query.status);
  if (query.userId) filter.userId = normalizeString(query.userId, 120);
  if (query.action) filter.action = normalizeString(query.action, 120);

  const dateFrom = normalizeDate(query.dateFrom);
  const dateTo = normalizeDate(query.dateTo);
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const q = normalizeString(query.q, 300);
  if (q) {
    const terms = Array.from(new Set(q.split(/\s+/).map((item) => item.trim()).filter((item) => item.length >= 2))).slice(0, 6);
    const expressions = (terms.length ? terms : [q]).map((term) => new RegExp(escapeRegExp(term), "i"));
    filter.$or = expressions.flatMap((regex) => [
      { question: regex },
      { answer: regex },
      { memoryContextPreview: regex },
      { action: regex },
      { module: regex }
    ]);
  }

  return filter;
}

async function createActivityLog(payload = {}) {
  const log = await AiActivityLog.create({
    tenantId: payload.tenantId,
    userId: payload.userId || undefined,
    projectKey: normalizeString(payload.projectKey || "associacoes", 120).toLowerCase() || "associacoes",
    module: normalizeString(payload.module || "NEXORA IA", 160) || "NEXORA IA",
    action: normalizeString(payload.action || "assistant.message", 160) || "assistant.message",
    question: normalizeString(payload.question, 6000),
    answer: normalizeString(payload.answer, 6000),
    memoryIds: normalizeMemoryIds(payload.memoryIds),
    memoryCount: Math.max(0, Number(payload.memoryCount || 0)),
    memoryContextPreview: normalizeString(payload.memoryContextPreview, 1200),
    status: normalizeStatus(payload.status),
    errorMessage: normalizeString(payload.errorMessage, 1600),
    durationMs: Math.max(0, Number(payload.durationMs || 0)),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date()
  });
  return serialize(log);
}

async function listActivityLogs({ tenantId, query = {} }) {
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const filter = buildFilter({ tenantId, query });
  const logs = await AiActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return logs.map(serialize);
}

async function getActivityLogById({ tenantId, id }) {
  const log = await AiActivityLog.findOne({ _id: id, tenantId }).lean();
  return serialize(log);
}

async function getActivityLogStats({ tenantId, query = {} }) {
  const filter = buildFilter({ tenantId, query });
  const aggregateFilter = { ...filter };
  if (aggregateFilter.tenantId && mongoose.Types.ObjectId.isValid(aggregateFilter.tenantId)) {
    aggregateFilter.tenantId = new mongoose.Types.ObjectId(String(aggregateFilter.tenantId));
  }

  const [total, success, error, avgDurationRaw, byProjectRaw, recentRaw] = await Promise.all([
    AiActivityLog.countDocuments(filter),
    AiActivityLog.countDocuments({ ...filter, status: "success" }),
    AiActivityLog.countDocuments({ ...filter, status: "error" }),
    AiActivityLog.aggregate([
      { $match: aggregateFilter },
      { $group: { _id: null, avgDurationMs: { $avg: "$durationMs" } } }
    ]),
    AiActivityLog.aggregate([
      { $match: aggregateFilter },
      { $group: { _id: "$projectKey", total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } }
    ]),
    AiActivityLog.find(filter).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  return {
    total: Number(total || 0),
    success: Number(success || 0),
    error: Number(error || 0),
    avgDurationMs: Number(avgDurationRaw?.[0]?.avgDurationMs || 0),
    byProject: byProjectRaw.map((item) => ({ projectKey: item?._id || "associacoes", total: Number(item?.total || 0) })),
    recent: recentRaw.map(serialize)
  };
}

module.exports = {
  createActivityLog,
  listActivityLogs,
  getActivityLogById,
  getActivityLogStats,
  buildFilter,
  serialize
};
