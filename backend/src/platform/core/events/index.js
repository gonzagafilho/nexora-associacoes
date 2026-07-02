const { listOsEvents, getOsEventsDashboard } = require("../../../services/system/osEventLogService");

async function list({ tenantId, limit = 20 }) {
  const result = await listOsEvents({ tenantId, page: 1, limit });
  return result.items || [];
}

async function stats({ tenantId }) {
  const dashboard = await getOsEventsDashboard({ tenantId });
  return {
    totalEvents: Number(dashboard.totalEvents || 0),
    failedEvents: Number(dashboard.failedEvents || 0),
    todayEvents: Number(dashboard.todayEvents || 0)
  };
}

module.exports = {
  list,
  stats
};
