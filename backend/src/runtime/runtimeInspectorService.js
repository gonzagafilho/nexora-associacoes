const runtime = require("./runtime");
const { listOsEvents } = require("../services/system/osEventLogService");

async function getRuntimeInspector(context = {}) {
  const tenantId = context?.tenantId || null;
  const services = runtime.listServices();
  const cacheStats = runtime.cache().stats();
  const sessionStats = runtime.sessions().stats();
  const driverMap = runtime.drivers().listDrivers();
  const workflowDashboard = await runtime.workflowDashboard(context).catch(() => ({ totalWorkflows: 0 }));
  const events = tenantId
    ? await listOsEvents({ tenantId, limit: 10, page: 1 }).catch(() => ({ items: [] }))
    : { items: [] };

  const metrics = runtime.getRuntimeMetrics({
    cacheEntries: cacheStats.total,
    activeSessions: sessionStats.active,
    workflowsActive: Number(workflowDashboard.totalWorkflows || 0)
  });

  return {
    status: runtime.getRuntimeStatus().status,
    uptime: metrics.uptimeSeconds,
    services,
    cache: cacheStats,
    sessions: sessionStats,
    metrics,
    recentEvents: events.items || [],
    activeWorkflows: Number(workflowDashboard.totalWorkflows || 0),
    drivers: driverMap
  };
}

module.exports = {
  getRuntimeInspector
};
