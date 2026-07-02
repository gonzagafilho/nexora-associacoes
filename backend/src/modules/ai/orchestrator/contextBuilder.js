const Tenant = require("../../../models/Tenant");
const TenantMemory = require("../../memory/memory.model");
const aiActivityLogService = require("../aiActivityLog.service");
const { registry } = require("../skills/registry");

async function buildContext({ tenantId, userId, projectKey, question, context = {} }) {
  const [tenant, projectMemory, tenantMemory, userMemory, recentLogs, activityStats] = await Promise.all([
    Tenant.findById(tenantId).select("name slug status businessType enabledModules paymentGateway").lean(),
    TenantMemory.find({ tenantId, projectKey }).sort({ updatedAt: -1 }).limit(20).lean(),
    TenantMemory.find({ tenantId, scope: "organization" }).sort({ updatedAt: -1 }).limit(20).lean(),
    TenantMemory.find({ tenantId, createdBy: userId }).sort({ updatedAt: -1 }).limit(20).lean(),
    aiActivityLogService.listActivityLogs({ tenantId, query: { projectKey, limit: 20 } }),
    aiActivityLogService.getActivityLogStats({ tenantId, query: { projectKey } })
  ]);

  const permissionsContext = {
    tenantId,
    userId,
    userRole: context.userRole,
    userEmail: context.userEmail,
    enabledModules: Array.isArray(context.enabledModules)
      ? context.enabledModules
      : Array.isArray(tenant?.enabledModules)
        ? tenant.enabledModules
        : []
  };

  const availableSkills = registry.list().map((skill) => ({
    ...skill,
    active: Boolean(skill.active) && registry.validatePermissions({ permissions: skill.permissions }, permissionsContext)
  }));

  return {
    tenant: {
      id: String(tenantId),
      name: tenant?.name || "",
      slug: tenant?.slug || "",
      status: tenant?.status || "unknown",
      businessType: tenant?.businessType || "association",
      paymentGateway: tenant?.paymentGateway || "manual",
      enabledModules: permissionsContext.enabledModules
    },
    projectKey: String(projectKey || "associacoes").trim().toLowerCase() || "associacoes",
    user: {
      id: String(userId || ""),
      role: String(context.userRole || "").trim().toLowerCase(),
      email: String(context.userEmail || "").trim().toLowerCase()
    },
    question: String(question || "").trim(),
    memories: {
      projectMemory,
      tenantMemory,
      userMemory
    },
    activity: {
      recentLogs,
      stats: activityStats
    },
    availableSkills,
    builtAt: new Date().toISOString()
  };
}

module.exports = {
  buildContext
};
