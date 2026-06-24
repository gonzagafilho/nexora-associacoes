const BillingAuditLog = require("../../models/BillingAuditLog");

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|raw|payload|response|access|clientSecret)/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function sanitizeMetadata(value, depth = 0) {
  if (!value || depth > 3) return {};
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (!isPlainObject(value)) return value;

  return Object.entries(value).reduce((safe, [key, item]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) return safe;
    if (item === undefined || typeof item === "function") return safe;
    safe[key] = isPlainObject(item) || Array.isArray(item)
      ? sanitizeMetadata(item, depth + 1)
      : item;
    return safe;
  }, {});
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : null;
}

function persistWithTimeout(payload) {
  const createPromise = BillingAuditLog.create(payload);
  createPromise.catch(() => {});
  return Promise.race([
    createPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout ao registrar auditoria")), 25))
  ]);
}

function getRequestIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req?.ip || req?.socket?.remoteAddress || "";
}

function getUserEmail(req, explicitEmail) {
  return explicitEmail || req?.user?.email || "";
}

async function createBillingAuditLog(data = {}) {
  try {
    const req = data.req;
    const userId = data.userId ?? req?.user?.id ?? null;
    const userRole = data.userRole ?? req?.user?.role ?? "";
    const userEmail = getUserEmail(req, data.userEmail);

    await persistWithTimeout({
      tenantId: normalizeObjectId(data.tenantId ?? req?.user?.tenantId),
      userId: normalizeObjectId(userId),
      userEmail,
      userRole,
      ip: data.ip ?? getRequestIp(req),
      userAgent: data.userAgent ?? String(req?.headers?.["user-agent"] || ""),
      action: data.action,
      scope: data.scope,
      status: data.status,
      message: data.message || "",
      invoiceId: normalizeObjectId(data.invoiceId),
      associateId: normalizeObjectId(data.associateId),
      saasPaymentId: normalizeObjectId(data.saasPaymentId),
      gatewayPaymentId: data.gatewayPaymentId || "",
      amount: data.amount,
      metadata: sanitizeMetadata(data.metadata || {})
    });
  } catch (error) {
    console.error("[billing-audit] falha ao registrar auditoria", error.message);
  }
}

module.exports = {
  createBillingAuditLog,
  sanitizeMetadata
};
