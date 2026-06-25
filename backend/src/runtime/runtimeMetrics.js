const startedAt = new Date();

const counters = {
  eventsPublished: 0,
  servicesRegistered: 0,
  workflowsActive: 0
};

function increment(metric, amount = 1) {
  const key = String(metric || "").trim();
  if (!key) return 0;
  if (!Object.prototype.hasOwnProperty.call(counters, key)) {
    counters[key] = 0;
  }
  counters[key] += Number(amount) || 1;
  return counters[key];
}

function snapshot(extra = {}) {
  const now = Date.now();
  return {
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((now - startedAt.getTime()) / 1000)),
    eventsPublished: Number(counters.eventsPublished || 0),
    servicesRegistered: Number(counters.servicesRegistered || 0),
    cacheEntries: Number(extra.cacheEntries || 0),
    activeSessions: Number(extra.activeSessions || 0),
    workflowsActive: Number(extra.workflowsActive ?? counters.workflowsActive ?? 0),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version
  };
}

function resetForTest() {
  counters.eventsPublished = 0;
  counters.servicesRegistered = 0;
  counters.workflowsActive = 0;
}

module.exports = {
  increment,
  snapshot,
  resetForTest
};
