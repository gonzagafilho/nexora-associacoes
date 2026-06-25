const RESERVED_EVENTS = [
  "tenant.created",
  "user.created",
  "associate.created",
  "associate.updated",
  "associate.deleted",
  "financial.transaction.created",
  "financial.transaction.paid",
  "financial.transaction.cancelled",
  "invoice.created",
  "invoice.paid",
  "invoice.cancelled",
  "invoice.overdue",
  "project.created",
  "project.updated",
  "project.completed",
  "project.cancelled",
  "asset.created",
  "asset.updated",
  "asset.maintenance",
  "asset.retired",
  "asset.sold",
  "asset.deleted",
  "protocol.created",
  "protocol.updated",
  "protocol.status_changed",
  "protocol.resolved",
  "protocol.closed",
  "protocol.cancelled",
  "subscription.checkout_created",
  "subscription.payment_approved",
  "subscription.renewal_created",
  "subscription.overdue",
  "notification.created",
  "push.sent",
  "ai.message",
  "ai.execution",
  "ai.execution_planned",
  "ai.execution_confirmed",
  "ai.execution_completed",
  "workflow.started",
  "workflow.action",
  "workflow.completed",
  "workflow.failed",
  "workflow.scheduler"
];

const subscribers = new Map();
const stats = {
  published: 0,
  delivered: 0,
  failed: 0,
  byEvent: {}
};

function eventStatsBucket(eventName) {
  if (!stats.byEvent[eventName]) {
    stats.byEvent[eventName] = {
      published: 0,
      delivered: 0,
      failed: 0,
      subscribers: 0
    };
  }
  return stats.byEvent[eventName];
}

function subscribe(eventName, handler) {
  if (!eventName || typeof handler !== "function") {
    throw new Error("eventBus.subscribe requer eventName e handler válido.");
  }
  if (!subscribers.has(eventName)) {
    subscribers.set(eventName, new Set());
  }
  subscribers.get(eventName).add(handler);
  eventStatsBucket(eventName).subscribers = subscribers.get(eventName).size;

  return () => {
    const handlers = subscribers.get(eventName);
    if (!handlers) return;
    handlers.delete(handler);
    eventStatsBucket(eventName).subscribers = handlers.size;
  };
}

function subscribeMany(eventNames, handler) {
  if (!Array.isArray(eventNames)) {
    throw new Error("eventBus.subscribeMany requer uma lista de eventos.");
  }
  return eventNames.map((eventName) => subscribe(eventName, handler));
}

async function publish(eventName, payload = {}, context = {}) {
  if (!eventName) {
    throw new Error("eventBus.publish requer eventName.");
  }

  const handlers = [...(subscribers.get(eventName) || [])];
  const result = {
    eventName,
    delivered: 0,
    failed: 0,
    errors: []
  };

  stats.published += 1;
  const bucket = eventStatsBucket(eventName);
  bucket.published += 1;
  bucket.subscribers = handlers.length;

  for (const handler of handlers) {
    try {
      await Promise.resolve(
        handler({
          eventName,
          payload,
          context,
          occurredAt: new Date().toISOString()
        })
      );
      result.delivered += 1;
      stats.delivered += 1;
      bucket.delivered += 1;
    } catch (error) {
      result.failed += 1;
      stats.failed += 1;
      bucket.failed += 1;
      result.errors.push(error?.message || "Erro desconhecido ao processar evento.");
    }
  }

  return result;
}

function getEventStats() {
  const subscribersCount = [...subscribers.values()].reduce((acc, set) => acc + set.size, 0);
  return {
    published: stats.published,
    delivered: stats.delivered,
    failed: stats.failed,
    subscribers: subscribersCount,
    byEvent: Object.fromEntries(
      Object.entries(stats.byEvent).map(([name, value]) => [name, { ...value }])
    )
  };
}

function clearSubscribersForTest() {
  subscribers.clear();
  stats.published = 0;
  stats.delivered = 0;
  stats.failed = 0;
  stats.byEvent = {};
}

module.exports = {
  RESERVED_EVENTS,
  publish,
  subscribe,
  subscribeMany,
  getEventStats,
  clearSubscribersForTest
};
