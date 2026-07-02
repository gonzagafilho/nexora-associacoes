const Tenant = require("../models/Tenant");
const { registry } = require("./appRegistry");
const memoryCore = require("./core/memory");
const skillsCore = require("./core/skills");
const eventsCore = require("./core/events");
const { appPermissions, allowedForApp } = require("./core/permissions");

async function provideAppContext({ tenantId, projectKey, appId, userId, userRole, userEmail, enabledModules = [] }) {
  const resolvedAppId = String(appId || "associacoes").trim().toLowerCase() || "associacoes";
  const app = registry.get(resolvedAppId);
  if (!app) {
    const error = new Error(`App não registrado: ${resolvedAppId}`);
    error.statusCode = 404;
    throw error;
  }

  const [tenant, memoryStats, skills, eventsStats] = await Promise.all([
    Tenant.findById(tenantId).select("name slug status businessType enabledModules").lean(),
    memoryCore.stats({ tenantId, projectKey }),
    Promise.resolve(skillsCore.list({ tenantId, userId, userRole, userEmail, enabledModules })),
    eventsCore.stats({ tenantId })
  ]);

  return {
    app,
    tenant: {
      id: String(tenantId),
      name: tenant?.name || "",
      slug: tenant?.slug || "",
      status: tenant?.status || "unknown",
      businessType: tenant?.businessType || "association",
      enabledModules: Array.isArray(tenant?.enabledModules) ? tenant.enabledModules : enabledModules
    },
    identity: {
      userId: String(userId || ""),
      userRole: String(userRole || "").trim().toLowerCase(),
      userEmail: String(userEmail || "").trim().toLowerCase()
    },
    projectKey: String(projectKey || "associacoes").trim().toLowerCase() || "associacoes",
    memory: memoryStats,
    configuration: {
      appPermissions: appPermissions(resolvedAppId),
      appEnabled: Boolean(app.enabled)
    },
    skills,
    permissions: {
      allowed: allowedForApp({ appId: resolvedAppId, role: userRole, enabledModules }),
      required: appPermissions(resolvedAppId)
    },
    events: eventsStats,
    providedAt: new Date().toISOString()
  };
}

module.exports = {
  provideAppContext
};
