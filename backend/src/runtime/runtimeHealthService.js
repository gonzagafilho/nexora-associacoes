const { getKernelInfo } = require("../os/kernel");
const { getEventStats } = require("../os/eventBus");
const runtime = require("./runtime");

async function getRuntimeHealth(context = {}) {
  const services = runtime.listServices();
  const cacheStats = runtime.cache().stats();
  const sessionStats = runtime.sessions().stats();
  const driverMap = runtime.drivers().listDrivers();
  const workflowDashboard = await runtime.workflowDashboard(context).catch(() => ({ totalWorkflows: 0 }));
  const metrics = runtime.getRuntimeMetrics({
    cacheEntries: cacheStats.total,
    activeSessions: sessionStats.active,
    workflowsActive: Number(workflowDashboard.totalWorkflows || 0)
  });

  return {
    runtime: runtime.getRuntimeStatus(),
    kernel: getKernelInfo(),
    eventBus: {
      status: "online",
      stats: getEventStats()
    },
    workflow: {
      status: "online",
      totalWorkflows: Number(workflowDashboard.totalWorkflows || 0)
    },
    cache: cacheStats,
    sessions: sessionStats,
    services: {
      total: services.length,
      items: services
    },
    drivers: {
      types: Object.keys(driverMap).length,
      items: driverMap
    },
    metrics
  };
}

module.exports = {
  getRuntimeHealth
};
