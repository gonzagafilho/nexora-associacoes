const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "accesstoken",
  "refreshtoken",
  "headers"
]);

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeContext(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeContext(item));
  if (typeof value !== "object") return value;

  const sanitized = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;
    sanitized[key] = sanitizeContext(nested);
  }
  return sanitized;
}

function createTenantContext({ tenantId, userId, role, modules }) {
  return sanitizeContext({
    tenantId: tenantId || null,
    userId: userId || null,
    role: role || "",
    modules: Array.isArray(modules) ? modules : []
  });
}

function createContext(req) {
  const tokenModules = req?.tenantModules || req?.user?.enabledModules || [];
  return createTenantContext({
    tenantId: req?.user?.tenantId || null,
    userId: req?.user?.id || req?.user?.sub || null,
    role: req?.user?.role || "",
    modules: Array.isArray(tokenModules) ? tokenModules : []
  });
}

function getTenantId(context = {}) {
  return context?.tenantId || null;
}

function getUserId(context = {}) {
  return context?.userId || null;
}

function hasModule(context = {}, moduleCode = "") {
  const normalizedModule = String(moduleCode || "").toLowerCase().trim();
  if (!normalizedModule) return true;
  const modules = Array.isArray(context.modules) ? context.modules : [];
  return modules.map((item) => String(item || "").toLowerCase().trim()).includes(normalizedModule);
}

module.exports = {
  createContext,
  createTenantContext,
  getTenantId,
  getUserId,
  hasModule,
  sanitizeContext
};
