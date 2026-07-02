const metrics = new Map();

function emptyMetrics() {
  return {
    totalExecutions: 0,
    successExecutions: 0,
    failedExecutions: 0,
    averageLatencyMs: 0,
    lastExecutionAt: null,
    eventsReceived: 0,
    eventsPublished: 0
  };
}

function getMetrics(agentId) {
  if (!metrics.has(agentId)) metrics.set(agentId, emptyMetrics());
  return metrics.get(agentId);
}

function recordExecution(agentId, { ok, latencyMs }) {
  const current = getMetrics(agentId);
  const totalBefore = current.totalExecutions;
  current.totalExecutions += 1;
  current.successExecutions += ok ? 1 : 0;
  current.failedExecutions += ok ? 0 : 1;
  current.averageLatencyMs = Math.round(((current.averageLatencyMs * totalBefore) + Number(latencyMs || 0)) / current.totalExecutions);
  current.lastExecutionAt = new Date().toISOString();
  return { ...current };
}

function recordEventReceived(agentId) {
  const current = getMetrics(agentId);
  current.eventsReceived += 1;
  return { ...current };
}

function recordEventPublished(agentId) {
  const current = getMetrics(agentId);
  current.eventsPublished += 1;
  return { ...current };
}

function getAllMetrics() {
  return Object.fromEntries([...metrics.entries()].map(([agentId, value]) => [agentId, { ...value }]));
}

function resetMetricsForTest() {
  metrics.clear();
}

module.exports = {
  emptyMetrics,
  getMetrics,
  recordExecution,
  recordEventReceived,
  recordEventPublished,
  getAllMetrics,
  resetMetricsForTest
};
