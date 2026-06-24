const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const {
  LEGACY_FULL_ACCESS_CODES,
  normalizeModuleCode,
  normalizeModuleCodes
} = require("../services/subscription/subscriptionPricingService");

function resolveTenantModules(tenant) {
  const configured = normalizeModuleCodes(tenant?.enabledModules || []);
  return configured.length ? configured : LEGACY_FULL_ACCESS_CODES;
}

function resolveFallbackModules(req) {
  const tokenModules = normalizeModuleCodes(req.user?.enabledModules || []);
  return tokenModules.length ? tokenModules : LEGACY_FULL_ACCESS_CODES;
}

function requireModule(moduleCode) {
  const normalizedRequired = normalizeModuleCode(moduleCode);

  return async function moduleGuard(req, res, next) {
    if (!req.user?.tenantId) {
      return res.status(401).json({ ok: false, message: "Token não informado." });
    }

    try {
      let enabledModules = resolveFallbackModules(req);

      if (mongoose.connection?.readyState === 1) {
        const tenantQuery = Tenant.findById(req.user.tenantId);
        const selectedQuery = typeof tenantQuery?.select === "function"
          ? tenantQuery.select("enabledModules")
          : tenantQuery;
        const tenant = typeof selectedQuery?.lean === "function"
          ? await selectedQuery.lean()
          : await selectedQuery;
        enabledModules = resolveTenantModules(tenant);
      }

      if (!enabledModules.includes(normalizedRequired)) {
        return res.status(403).json({ ok: false, message: "Módulo não contratado." });
      }

      req.tenantModules = enabledModules;
      return next();
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Falha ao validar módulo contratado." });
    }
  };
}

module.exports = requireModule;
