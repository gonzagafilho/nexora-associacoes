const state = {
  emitted: 0,
  lastNotificationAt: null
};

function emitNotification(payload = {}, context = {}) {
  state.emitted += 1;
  state.lastNotificationAt = new Date().toISOString();

  return {
    ok: true,
    mode: "wrapper",
    queued: true,
    payload,
    context,
    timestamp: state.lastNotificationAt
  };
}

function getNotificationEngineStatus() {
  return {
    mode: "wrapper",
    emitted: state.emitted,
    lastNotificationAt: state.lastNotificationAt,
    targetService: "notificationService"
  };
}

module.exports = {
  emitNotification,
  getNotificationEngineStatus
};
