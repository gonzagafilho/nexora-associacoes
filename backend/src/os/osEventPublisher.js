const { publish } = require("./eventBus");
const { registerOsEvent } = require("../services/system/osEventLogService");

const SENSITIVE_KEYS = new Set([
  "token",
  "secret",
  "password",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "raw",
  "rawpayload",
  "gatewayresponse",
  "webhookpayload"
]);

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeEventPayload(payload) {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map((item) => sanitizeEventPayload(item));
  if (typeof payload !== "object") return payload;

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;
    sanitized[key] = sanitizeEventPayload(value);
  }
  return sanitized;
}

function buildEventContext(req) {
  return {
    tenantId: req?.user?.tenantId || null,
    userId: req?.user?.id || null,
    role: req?.user?.role || "",
    ip: String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "").split(",")[0].trim()
  };
}

async function publishOsEvent(eventName, data = {}, context = {}) {
  try {
    const occurredAt = data.occurredAt || new Date().toISOString();
    const event = {
      tenantId: data.tenantId || context.tenantId || null,
      userId: data.userId || context.userId || null,
      module: data.module || "system",
      action: data.action || "unknown",
      entityId: data.entityId ? String(data.entityId) : "",
      entityType: data.entityType || "",
      occurredAt,
      payload: sanitizeEventPayload(data.payload || {})
    };

    const published = await publish(eventName, event, {
      tenantId: event.tenantId,
      userId: event.userId,
      module: event.module,
      action: event.action
    });

    await registerOsEvent({
      ...event,
      eventName,
      delivered: published.delivered,
      failed: published.failed,
      errors: published.errors
    });

    return { ok: true, ...published };
  } catch (error) {
    await registerOsEvent({
      tenantId: data.tenantId || context.tenantId || null,
      userId: data.userId || context.userId || null,
      module: data.module || "system",
      action: data.action || "unknown",
      entityId: data.entityId ? String(data.entityId) : "",
      entityType: data.entityType || "",
      occurredAt: data.occurredAt || new Date().toISOString(),
      payload: sanitizeEventPayload(data.payload || {}),
      eventName,
      delivered: 0,
      failed: 1,
      errors: [error?.message || "failed_to_publish"]
    });

    return {
      ok: false,
      eventName,
      delivered: 0,
      failed: 1,
      errors: [error?.message || "failed_to_publish"]
    };
  }
}

module.exports = {
  publishOsEvent,
  sanitizeEventPayload,
  buildEventContext
};
