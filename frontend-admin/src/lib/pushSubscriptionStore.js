const STORAGE_KEY = "nexora_push_subscriptions";

function normalizeId(value) {
  return value ? String(value) : "";
}

export function createPushSubscriptionRecord({ tenantId, userId, endpoint }) {
  return {
    tenantId: normalizeId(tenantId),
    userId: normalizeId(userId),
    endpoint: String(endpoint || "").trim(),
    createdAt: new Date().toISOString()
  };
}

export function loadPushSubscriptions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_error) {
    return [];
  }
}

export function savePushSubscription(record) {
  const list = loadPushSubscriptions();
  list.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

module.exports = {
  STORAGE_KEY,
  createPushSubscriptionRecord,
  loadPushSubscriptions,
  savePushSubscription
};