const OsEventLog = require("../../models/OsEventLog");

const MAX_JSON_SIZE = 12 * 1024;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 40;
const MAX_OBJECT_KEYS = 40;

function trimString(value) {
  const text = String(value || "");
  if (text.length <= MAX_STRING_LENGTH) return text;
  return `${text.slice(0, MAX_STRING_LENGTH)}...[truncated:${text.length - MAX_STRING_LENGTH}]`;
}

function trimValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => trimValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(entries.map(([key, item]) => [key, trimValue(item, depth + 1)]));
  }
  if (typeof value === "string") return trimString(value);
  return value;
}

function limitPayloadSize(payload = {}) {
  const trimmed = trimValue(payload);
  const encoded = JSON.stringify(trimmed);
  if (encoded.length <= MAX_JSON_SIZE) return trimmed;

  return {
    _truncated: true,
    preview: encoded.slice(0, MAX_JSON_SIZE),
    originalSize: encoded.length
  };
}

function normalizeDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toPositiveInt(value, fallback, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function registerOsEvent(entry = {}) {
  try {
    const status = entry.failed > 0 ? (entry.delivered > 0 ? "partial" : "failed") : "success";
    const created = await OsEventLog.create({
      tenantId: entry.tenantId,
      eventName: String(entry.eventName || ""),
      module: String(entry.module || "system"),
      action: String(entry.action || "unknown"),
      entityId: entry.entityId ? String(entry.entityId) : "",
      entityType: String(entry.entityType || ""),
      userId: entry.userId || undefined,
      status,
      delivered: Number(entry.delivered || 0),
      failed: Number(entry.failed || 0),
      occurredAt: normalizeDate(entry.occurredAt),
      payload: limitPayloadSize(entry.payload || {}),
      errors: Array.isArray(entry.errors) ? entry.errors.map((item) => trimString(item)) : []
    });
    return { ok: true, id: created._id, status };
  } catch (error) {
    return { ok: false, message: error?.message || "failed_to_log_event" };
  }
}

function buildEventFilter(params = {}) {
  const filter = {};
  if (params.tenantId) filter.tenantId = params.tenantId;
  if (params.eventName) filter.eventName = String(params.eventName);
  if (params.module) filter.module = String(params.module);
  if (params.action) filter.action = String(params.action);

  if (params.dateFrom || params.dateTo) {
    filter.occurredAt = {};
    if (params.dateFrom) filter.occurredAt.$gte = normalizeDate(params.dateFrom);
    if (params.dateTo) {
      const to = normalizeDate(params.dateTo);
      to.setHours(23, 59, 59, 999);
      filter.occurredAt.$lte = to;
    }
  }

  return filter;
}

async function listOsEvents(params = {}) {
  const page = toPositiveInt(params.page, 1, 10000);
  const limit = toPositiveInt(params.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = buildEventFilter(params);

  const [total, items] = await Promise.all([
    OsEventLog.countDocuments(filter),
    OsEventLog.find(filter).sort({ occurredAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean()
  ]);

  return {
    ok: true,
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0
  };
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getOsEventsDashboard(params = {}) {
  const filter = buildEventFilter(params);
  const todayStart = startOfDay();

  const [totalEvents, todayEvents, failedEvents, byModuleRaw, byEventNameRaw] = await Promise.all([
    OsEventLog.countDocuments(filter),
    OsEventLog.countDocuments({ ...filter, occurredAt: { ...(filter.occurredAt || {}), $gte: todayStart } }),
    OsEventLog.countDocuments({ ...filter, failed: { $gt: 0 } }),
    OsEventLog.aggregate([
      { $match: filter },
      { $group: { _id: "$module", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 8 }
    ]),
    OsEventLog.aggregate([
      { $match: filter },
      { $group: { _id: "$eventName", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 8 }
    ])
  ]);

  return {
    totalEvents,
    todayEvents,
    failedEvents,
    byModule: byModuleRaw.map((item) => ({ module: item._id || "unknown", total: item.total })),
    byEventName: byEventNameRaw.map((item) => ({ eventName: item._id || "unknown", total: item.total }))
  };
}

module.exports = {
  registerOsEvent,
  listOsEvents,
  getOsEventsDashboard,
  buildEventFilter,
  limitPayloadSize
};
