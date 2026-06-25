const webpush = require("web-push");

const PushSubscription = require("../../models/PushSubscription");
const Notification = require("../../models/Notification");

let warnedMissingVapid = false;

function vapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:suporte@nexoracloud.com.br").trim();
  return { publicKey, privateKey, subject, enabled: Boolean(publicKey && privateKey && subject) };
}

function configureWebPush() {
  const config = vapidConfig();
  if (!config.enabled) {
    if (!warnedMissingVapid) {
      console.warn("[push] VAPID ausente; envio push desabilitado.");
      warnedMissingVapid = true;
    }
    return config;
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
}

function getPublicKeyInfo() {
  const config = vapidConfig();
  return { publicKey: config.publicKey || null, enabled: config.enabled };
}

function normalizeId(value) {
  return value ? String(value) : "";
}

function notificationUrl(notification = {}) {
  const module = String(notification.module || "").trim();
  if (!module) return "/#notificacoes";
  const routes = { financial: "financeiro", projects: "projetos", assets: "patrimonio", protocols: "protocolos", associates: "associados", invoices: "mensalidades", saas: "assinatura" };
  return "/#" + (routes[module] || "notificacoes");
}

function buildPayload(payload = {}) {
  return {
    title: String(payload.title || "NEXORA Gestão"),
    body: String(payload.body || payload.message || "Nova notificação disponível."),
    icon: String(payload.icon || "/icons/icon-192.png"),
    badge: String(payload.badge || "/icons/icon-maskable.png"),
    url: String(payload.url || "/#notificacoes"),
    notificationId: normalizeId(payload.notificationId || payload.id),
    module: String(payload.module || ""),
    severity: String(payload.severity || "low")
  };
}

function toWebPushSubscription(subscription = {}) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys?.p256dh || subscription.p256dh,
      auth: subscription.keys?.auth || subscription.auth
    }
  };
}

async function removeInvalidSubscription(subscription) {
  if (!subscription?._id && !subscription?.endpoint) return;
  const filter = subscription._id ? { _id: subscription._id } : { endpoint: subscription.endpoint };
  await PushSubscription.deleteOne(filter).catch(() => null);
}

async function sendToSubscriptions(subscriptions = [], payload = {}) {
  const config = configureWebPush();
  if (!config.enabled) return { ok: true, enabled: false, sent: 0, removed: 0, failed: 0 };

  const body = JSON.stringify(buildPayload(payload));
  const summary = { ok: true, enabled: true, sent: 0, removed: 0, failed: 0 };
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(toWebPushSubscription(subscription), body);
      summary.sent += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        await removeInvalidSubscription(subscription);
        summary.removed += 1;
      } else {
        summary.failed += 1;
        console.warn("[push] falha ao enviar", statusCode || error?.message || error);
      }
    }
  }
  return summary;
}

async function sendPushToUser(userId, tenantId, payload = {}) {
  const config = configureWebPush();
  if (!config.enabled) return { ok: true, enabled: false, sent: 0, removed: 0, failed: 0 };
  const subscriptions = await PushSubscription.find({ tenantId, userId }).lean();
  return sendToSubscriptions(subscriptions, payload);
}

async function sendPushToTenant(tenantId, payload = {}) {
  const config = configureWebPush();
  if (!config.enabled) return { ok: true, enabled: false, sent: 0, removed: 0, failed: 0 };
  const subscriptions = await PushSubscription.find({ tenantId }).lean();
  return sendToSubscriptions(subscriptions, payload);
}

async function sendPushForNotification(notification) {
  const item = typeof notification?.toObject === "function" ? notification.toObject() : notification;
  if (!item?.tenantId || !item?.userId) return { ok: true, enabled: false, sent: 0, removed: 0, failed: 0 };
  const payload = {
    title: item.title,
    body: item.message,
    notificationId: item._id || item.id,
    module: item.module,
    severity: item.severity,
    url: notificationUrl(item)
  };
  return sendPushToUser(item.userId, item.tenantId, payload);
}

async function markNotificationPushDelivery(notificationId, status) {
  if (!notificationId || !["sent", "disabled"].includes(status)) return;
  await Notification.updateOne({ _id: notificationId }, { $set: { "delivery.push": status, "delivery.mobile": status } }).catch(() => null);
}

module.exports = {
  buildPayload,
  configureWebPush,
  getPublicKeyInfo,
  sendPushToUser,
  sendPushToTenant,
  sendPushForNotification,
  sendToSubscriptions,
  markNotificationPushDelivery,
  _private: { vapidConfig, toWebPushSubscription, removeInvalidSubscription }
};
