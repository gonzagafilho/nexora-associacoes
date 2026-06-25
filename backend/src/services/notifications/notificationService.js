const mongoose = require("mongoose");

const Notification = require("../../models/Notification");
const User = require("../../models/User");
const Protocol = require("../../models/Protocol");
const Project = require("../../models/Project");
const Asset = require("../../models/Asset");
const Associate = require("../../models/Associate");
const FinancialTransaction = require("../../models/FinancialTransaction");
const TenantSubscription = require("../../models/TenantSubscription");
const SaasSubscriptionPayment = require("../../models/SaasSubscriptionPayment");
const { SMART_ALERT_REFERENCE_TYPES } = require("./smartAlertTypes");
const { sendPushForNotification, markNotificationPushDelivery } = require("../push/pushNotificationService");
const { publishOsEvent } = require("../../os/osEventPublisher");

const FUTURE_CHANNELS = Object.freeze({
  email: { enabled: false },
  whatsapp: { enabled: false },
  push: { enabled: false },
  mobile: { enabled: false }
});

function normalizeId(value) {
  return value ? String(value) : "";
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function deliveryDefaults() {
  return {
    email: FUTURE_CHANNELS.email.enabled ? "pending" : "disabled",
    whatsapp: FUTURE_CHANNELS.whatsapp.enabled ? "pending" : "disabled",
    push: "pending",
    mobile: "pending"
  };
}

async function trySendPush(notification) {
  try {
    const result = await sendPushForNotification(notification);
    if (result?.enabled === false) return;
    const sent = Number(result?.sent || 0) > 0;
    await markNotificationPushDelivery(notification._id || notification.id, sent ? "sent" : "disabled");
  } catch (error) {
    console.warn("[notifications] push ignorado", error?.message || error);
  }
}

async function resolveAudienceUserIds({ tenantId, userId, actorUserId, audienceUserIds, allowWhenDisconnected = false }) {
  const explicit = Array.isArray(audienceUserIds) ? audienceUserIds.map(normalizeId).filter(Boolean) : [];
  if (explicit.length) return explicit;
  if (userId) return [normalizeId(userId)].filter(Boolean);
  if (mongoose.connection.readyState !== 1 && !allowWhenDisconnected) {
    return actorUserId ? [normalizeId(actorUserId)].filter(Boolean) : [];
  }
  try {
    const users = await User.find({ tenantId, status: "active" }).select("_id").lean();
    const ids = users.map((item) => normalizeId(item._id)).filter(Boolean);
    return ids.length ? ids : (actorUserId ? [normalizeId(actorUserId)].filter(Boolean) : []);
  } catch (_error) {
    return actorUserId ? [normalizeId(actorUserId)].filter(Boolean) : [];
  }
}

function serialize(notification) {
  return {
    id: normalizeId(notification._id),
    tenantId: normalizeId(notification.tenantId),
    userId: normalizeId(notification.userId),
    title: notification.title || "",
    message: notification.message || "",
    type: notification.type || "info",
    severity: notification.severity || "low",
    module: notification.module || "",
    referenceId: notification.referenceId || "",
    referenceType: notification.referenceType || "",
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt || null,
    createdAt: notification.createdAt || null
  };
}

async function createNotification(options = {}) {
  const tenantId = normalizeId(options.tenantId);
  if (!tenantId) return [];
  const title = String(options.title || "").trim();
  const message = String(options.message || "").trim();
  if (!title || !message || !options.module) return [];
  const allowWhenDisconnected = Boolean(options.allowWhenDisconnected);
  if (mongoose.connection.readyState !== 1 && !allowWhenDisconnected) return [];

  const userIds = await resolveAudienceUserIds({
    tenantId,
    userId: options.userId,
    actorUserId: options.actorUserId,
    audienceUserIds: options.audienceUserIds,
    allowWhenDisconnected
  });
  if (!userIds.length) return [];

  const referenceId = normalizeId(options.referenceId);
  const referenceType = String(options.referenceType || "").trim();
  const dedupeKey = String(options.dedupeKey || "").trim();
  const docs = userIds.map((currentUserId) => ({
    tenantId,
    userId: currentUserId,
    title,
    message,
    type: String(options.type || "info"),
    severity: String(options.severity || "low"),
    module: String(options.module || "").trim(),
    referenceId,
    referenceType,
    isRead: false,
    readAt: null,
    dedupeKey: dedupeKey ? `${dedupeKey}:${currentUserId}` : undefined,
    delivery: deliveryDefaults()
  }));

  try {
    const created = await Notification.insertMany(docs, { ordered: false });
    await Promise.all(created.map((item) => publishOsEvent("notification.created", {
      tenantId,
      userId: item.userId,
      module: "notifications",
      action: "created",
      entityId: item._id,
      entityType: "Notification",
      payload: {
        title: item.title,
        severity: item.severity,
        type: item.type,
        referenceType: item.referenceType
      }
    }, { tenantId, userId: item.userId }).catch(() => null)));
    await Promise.all(created.map((notification) => trySendPush(notification)));
    return created.map(serialize);
  } catch (error) {
    if (error?.writeErrors?.length && error.writeErrors.every((item) => item.code === 11000)) return [];
    if (error?.code === 11000) return [];
    throw error;
  }
}

async function markAsRead({ tenantId, userId, id }) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, tenantId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();
  return notification ? serialize(notification) : null;
}

async function markAllAsRead({ tenantId, userId }) {
  const result = await Notification.updateMany(
    { tenantId, userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return Number(result.modifiedCount || result.nModified || 0);
}

async function deleteNotification({ tenantId, userId, id }) {
  const result = await Notification.deleteOne({ _id: id, tenantId, userId });
  return Number(result.deletedCount || 0) > 0;
}

async function listNotifications({ tenantId, userId, limit = 50 }) {
  const notifications = await Notification.find({ tenantId, userId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit || 50), 100)).lean();
  return notifications.map(serialize);
}

async function getUnreadCount({ tenantId, userId }) {
  return Notification.countDocuments({ tenantId, userId, isRead: false });
}

async function getDashboard({ tenantId, userId }) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = addDays(todayStart, -6);
  const [unread, critical, today, week, smartAlertsToday] = await Promise.all([
    Notification.countDocuments({ tenantId, userId, isRead: false }),
    Notification.countDocuments({ tenantId, userId, severity: "critical", isRead: false }),
    Notification.countDocuments({ tenantId, userId, createdAt: { $gte: todayStart } }),
    Notification.countDocuments({ tenantId, userId, createdAt: { $gte: weekStart, $lte: endOfDay(now) } }),
    Notification.countDocuments({ tenantId, userId, createdAt: { $gte: todayStart }, referenceType: { $in: SMART_ALERT_REFERENCE_TYPES } })
  ]);
  return { unread, critical, today, week, smartAlertsToday };
}

async function ensureAutomaticNotifications({ tenantId }) {
  if (!tenantId || mongoose.connection.readyState !== 1) return;
  const now = new Date();
  const soonLimit = addDays(now, 7);

  const [overdueProtocols, delayedProjects, overdueExpenses, paidIncomesToday, associatesInactive, subscriptionsExpiring, subscriptionsOverdue, confirmedPayments, paidTransactions] = await Promise.all([
    Protocol.find({ tenantId, dueDate: { $lt: now }, status: { $nin: ["resolved", "closed", "cancelled"] } }).select("_id protocolNumber title priority dueDate").lean(),
    Project.find({ tenantId, endDate: { $lt: now }, status: { $nin: ["completed", "cancelled"] } }).select("_id name endDate status").lean(),
    FinancialTransaction.find({ tenantId, type: "expense", $or: [{ status: "overdue" }, { status: "pending", dueDate: { $lt: now } }] }).select("_id description amount dueDate").lean(),
    FinancialTransaction.find({ tenantId, type: "income", status: "paid", paidAt: { $gte: startOfDay(now), $lte: endOfDay(now) } }).select("_id description amount paidAt").lean(),
    Associate.find({ tenantId, status: "inactive" }).select("_id name updatedAt").lean(),
    TenantSubscription.find({ tenantId, nextBillingDate: { $gte: startOfDay(now), $lte: endOfDay(soonLimit) }, status: { $in: ["active", "trialing"] } }).select("_id plan nextBillingDate status").lean(),
    TenantSubscription.find({ tenantId, $or: [{ status: "overdue" }, { nextBillingDate: { $lt: now }, status: { $nin: ["cancelled"] } }] }).select("_id plan nextBillingDate status").lean(),
    SaasSubscriptionPayment.find({ tenantId, status: "approved", paidAt: { $gte: startOfDay(now), $lte: endOfDay(now) } }).select("_id amount paidAt gatewayPaymentId").lean(),
    FinancialTransaction.find({ tenantId, status: "paid" }).select("type amount").lean()
  ]);

  for (const protocol of overdueProtocols) {
    await createNotification({
      tenantId,
      title: `Protocolo vencido ${protocol.protocolNumber || ""}`.trim(),
      message: `${protocol.title || "Protocolo"} está vencido desde ${new Date(protocol.dueDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: protocol.priority === "urgent" ? "critical" : "high",
      module: "protocols",
      referenceId: protocol._id,
      referenceType: "protocol",
      dedupeKey: `protocol-overdue:${normalizeId(protocol._id)}`
    });
  }

  for (const project of delayedProjects) {
    await createNotification({
      tenantId,
      title: "Projeto atrasado",
      message: `${project.name || "Projeto"} ultrapassou o prazo previsto.`,
      type: "warning",
      severity: "high",
      module: "projects",
      referenceId: project._id,
      referenceType: "project",
      dedupeKey: `project-delayed:${normalizeId(project._id)}`
    });
  }

  for (const expense of overdueExpenses) {
    await createNotification({
      tenantId,
      title: "Despesa vencida",
      message: `${expense.description || "Despesa"} venceu com valor de R$ ${formatMoney(expense.amount)}.`,
      type: "warning",
      severity: "high",
      module: "financial",
      referenceId: expense._id,
      referenceType: "financial_transaction",
      dedupeKey: `financial-expense-overdue:${normalizeId(expense._id)}`
    });
  }

  for (const income of paidIncomesToday) {
    await createNotification({
      tenantId,
      title: "Receita recebida",
      message: `${income.description || "Receita"} foi liquidada em R$ ${formatMoney(income.amount)}.`,
      type: "success",
      severity: "medium",
      module: "financial",
      referenceId: income._id,
      referenceType: "financial_transaction",
      dedupeKey: `financial-income-paid:${normalizeId(income._id)}`
    });
  }

  for (const associate of associatesInactive) {
    await createNotification({
      tenantId,
      title: "Associado inativo",
      message: `${associate.name || "Associado"} está marcado como inativo.`,
      type: "warning",
      severity: "medium",
      module: "associates",
      referenceId: associate._id,
      referenceType: "associate",
      dedupeKey: `associate-inactive:${normalizeId(associate._id)}`
    });
  }

  for (const subscription of subscriptionsExpiring) {
    await createNotification({
      tenantId,
      title: "Assinatura vencendo",
      message: `A assinatura está próxima do vencimento em ${new Date(subscription.nextBillingDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: "medium",
      module: "saas",
      referenceId: subscription._id,
      referenceType: "subscription",
      dedupeKey: `saas-expiring:${normalizeId(subscription._id)}:${new Date(subscription.nextBillingDate).toISOString().slice(0, 10)}`
    });
  }

  for (const subscription of subscriptionsOverdue) {
    await createNotification({
      tenantId,
      title: "Assinatura vencida",
      message: `A assinatura está vencida desde ${subscription.nextBillingDate ? new Date(subscription.nextBillingDate).toLocaleDateString("pt-BR") : "data não informada"}.`,
      type: "error",
      severity: "critical",
      module: "saas",
      referenceId: subscription._id,
      referenceType: "subscription",
      dedupeKey: `saas-overdue:${normalizeId(subscription._id)}:${subscription.status}`
    });
  }

  for (const payment of confirmedPayments) {
    await createNotification({
      tenantId,
      title: "Pagamento confirmado",
      message: `Pagamento SaaS confirmado no valor de R$ ${formatMoney(payment.amount)}.`,
      type: "success",
      severity: "medium",
      module: "saas",
      referenceId: payment._id,
      referenceType: "saas_payment",
      dedupeKey: `saas-payment-approved:${normalizeId(payment._id)}`
    });
  }

  const negativeBalance = paidTransactions.reduce((acc, item) => acc + (item.type === "income" ? Number(item.amount || 0) : -Number(item.amount || 0)), 0);
  if (negativeBalance < 0) {
    await createNotification({
      tenantId,
      title: "Saldo negativo",
      message: `O saldo pago acumulado está negativo em R$ ${formatMoney(Math.abs(negativeBalance))}.`,
      type: "error",
      severity: "critical",
      module: "financial",
      referenceId: tenantId,
      referenceType: "tenant",
      dedupeKey: `financial-negative-balance:${startOfDay(now).toISOString().slice(0, 10)}`
    });
  }
}

module.exports = {
  FUTURE_CHANNELS,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  listNotifications,
  getUnreadCount,
  getDashboard,
  ensureAutomaticNotifications,
  serialize
};