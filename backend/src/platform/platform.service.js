const { registry } = require("./appRegistry");
const contextProvider = require("./contextProvider");
const memoryCore = require("./core/memory");
const skillsCore = require("./core/skills");
const orchestratorCore = require("./core/orchestrator");
const runtimeCore = require("./core/runtime");
const eventsCore = require("./core/events");
const integrationsCore = require("./core/integrations");

async function listApps() {
  const apps = registry.list();
  return {
    total: apps.length,
    active: apps.filter((item) => item.enabled).length,
    apps
  };
}

async function platformStatus({ tenantId, userId, role, enabledModules = [], projectKey = "associacoes" }) {
  const [memoryStats, activity, runtime, appsData, skills] = await Promise.all([
    memoryCore.stats({ tenantId, projectKey }).catch(() => ({ total: 0 })),
    eventsCore.stats({ tenantId }).catch(() => ({ totalEvents: 0, failedEvents: 0, todayEvents: 0 })),
    runtimeCore.health({ tenantId, userId, role, modules: enabledModules }).catch(() => ({ status: "unknown", health: { ok: false } })),
    listApps(),
    Promise.resolve(skillsCore.list({ tenantId, userId, userRole: role, enabledModules }))
  ]);

  return {
    version: "4.2.0",
    health: runtime.health?.ok === false ? "degraded" : "online",
    installedApps: Number(appsData.total || 0),
    activeApps: Number(appsData.active || 0),
    skills: Array.isArray(skills) ? skills.length : 0,
    agents: 7,
    memories: Number(memoryStats.total || 0),
    events: Number(activity.totalEvents || 0),
    runtime: runtime.status || runtime.health?.runtimeStatus || "online",
    integrations: integrationsCore.status(),
    timestamp: new Date().toISOString()
  };
}

async function coreOverview({ tenantId, userId, userRole, userEmail, enabledModules = [], projectKey = "associacoes" }) {
  const context = await contextProvider.provideAppContext({
    tenantId,
    projectKey,
    appId: "associacoes",
    userId,
    userRole,
    userEmail,
    enabledModules
  });

  return {
    core: {
      ai: "adapter-ready",
      memory: "adapter-ready",
      orchestrator: "adapter-ready",
      skills: "adapter-ready",
      runtime: "adapter-ready",
      events: "adapter-ready",
      auth: "adapter-ready",
      permissions: "adapter-ready",
      audit: "adapter-ready",
      integrations: "adapter-ready"
    },
    contextSummary: {
      appId: context.app.id,
      projectKey: context.projectKey,
      allowed: context.permissions.allowed,
      memoryTotal: Number(context.memory.total || 0),
      skills: Array.isArray(context.skills) ? context.skills.length : 0,
      events: Number(context.events.totalEvents || 0)
    }
  };
}

function modulesOverview() {
  const apps = registry.list();
  const modules = new Map();

  apps.forEach((app) => {
    (app.modules || []).forEach((moduleCode) => {
      const key = String(moduleCode || "").trim().toLowerCase();
      if (!key) return;
      if (!modules.has(key)) {
        modules.set(key, { module: key, apps: [] });
      }
      modules.get(key).apps.push(app.id);
    });
  });

  return {
    total: modules.size,
    modules: Array.from(modules.values()).sort((a, b) => a.module.localeCompare(b.module))
  };
}

async function appDashboard({ tenantId, projectKey, appId, userId, userRole, userEmail, enabledModules = [] }) {
  const context = await contextProvider.provideAppContext({ tenantId, projectKey, appId, userId, userRole, userEmail, enabledModules });
  const plans = orchestratorCore.listPlans({ tenantId, query: { projectKey, limit: 20 } });

  return {
    app: context.app,
    status: context.app.enabled ? "active" : "inactive",
    version: context.app.version,
    modules: context.app.modules,
    skillsUsed: (context.skills || []).filter((item) => item.active).map((item) => item.name),
    memories: Number(context.memory.total || 0),
    logs: {
      recentPlans: plans.length
    },
    events: context.events,
    permissions: context.permissions
  };
}

module.exports = {
  listApps,
  platformStatus,
  coreOverview,
  modulesOverview,
  appDashboard
};
