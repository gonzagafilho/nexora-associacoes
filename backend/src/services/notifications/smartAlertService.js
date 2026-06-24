const Tenant = require("../../models/Tenant");
const Notification = require("../../models/Notification");
const Protocol = require("../../models/Protocol");
const Project = require("../../models/Project");
const Asset = require("../../models/Asset");
const FinancialTransaction = require("../../models/FinancialTransaction");
const TenantSubscription = require("../../models/TenantSubscription");
const { createNotification } = require("./notificationService");
const { SMART_ALERT_REFERENCE_TYPES } = require("./smartAlertTypes");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  return new Date(value.getTime() + days * ONE_DAY_MS);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function buildSummary() {
  return {
    created: 0,
    skipped: 0,
    errors: 0
  };
}

function mergeSummary(target, current) {
  target.created += Number(current.created || 0);
  target.skipped += Number(current.skipped || 0);
  target.errors += Number(current.errors || 0);
}

async function hasUnreadSmartAlert({ tenantId, referenceType, referenceId }) {
  if (!tenantId || !referenceType || !referenceId) return false;
  const total = await Notification.countDocuments({
    tenantId,
    referenceType,
    referenceId,
    isRead: false
  });
  return total > 0;
}

async function createSmartAlert({
  tenantId,
  title,
  message,
  type,
  severity,
  module,
  referenceType,
  referenceId,
  dedupeSuffix
}) {
  const summary = buildSummary();

  try {
    const normalizedReferenceId = normalizeId(referenceId);
    if (!tenantId || !referenceType || !normalizedReferenceId) {
      summary.skipped += 1;
      return summary;
    }

    if (!SMART_ALERT_REFERENCE_TYPES.includes(referenceType)) {
      summary.skipped += 1;
      return summary;
    }

    const alreadyExists = await hasUnreadSmartAlert({
      tenantId,
      referenceType,
      referenceId: normalizedReferenceId
    });
    if (alreadyExists) {
      summary.skipped += 1;
      return summary;
    }

    const created = await createNotification({
      tenantId,
      title,
      message,
      type,
      severity,
      module,
      referenceType,
      referenceId: normalizedReferenceId,
      dedupeKey: `smart-alert:${referenceType}:${normalizedReferenceId}${dedupeSuffix ? `:${dedupeSuffix}` : ""}`,
      allowWhenDisconnected: true
    });

    if (created.length > 0) summary.created += created.length;
    else summary.skipped += 1;
    return summary;
  } catch (_error) {
    summary.errors += 1;
    return summary;
  }
}

async function checkOverdueProtocols({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const protocols = await Protocol.find({
    tenantId,
    dueDate: { $lt: startOfDay(now) },
    status: { $nin: ["resolved", "closed", "cancelled"] }
  }).select("_id protocolNumber").lean();

  for (const protocol of protocols) {
    const current = await createSmartAlert({
      tenantId,
      title: "Protocolo vencido",
      message: `O protocolo ${protocol.protocolNumber || "sem número"} está vencido.`,
      type: "warning",
      severity: "high",
      module: "protocols",
      referenceType: "protocol_overdue",
      referenceId: protocol._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkUrgentProtocolsWithoutResponsible({ tenantId }) {
  const summary = buildSummary();
  const protocols = await Protocol.find({
    tenantId,
    priority: "urgent",
    status: { $in: ["open", "in_progress"] },
    $or: [
      { assignedToName: "" },
      { assignedToName: null }
    ]
  }).select("_id protocolNumber").lean();

  for (const protocol of protocols) {
    const current = await createSmartAlert({
      tenantId,
      title: "Protocolo urgente sem responsável",
      message: `O protocolo ${protocol.protocolNumber || "sem número"} está urgente e sem responsável definido.`,
      type: "error",
      severity: "critical",
      module: "protocols",
      referenceType: "protocol_urgent_without_responsible",
      referenceId: protocol._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkProjectsEndingSoon({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const today = startOfDay(now);
  const soon = endOfDay(addDays(today, 7));
  const projects = await Project.find({
    tenantId,
    endDate: { $gte: today, $lte: soon },
    status: { $in: ["active", "planning"] }
  }).select("_id name endDate").lean();

  for (const project of projects) {
    const current = await createSmartAlert({
      tenantId,
      title: "Projeto vencendo em breve",
      message: `${project.name || "Projeto"} vence em ${new Date(project.endDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: "medium",
      module: "projects",
      referenceType: "project_ending_soon",
      referenceId: project._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkOverdueProjects({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const projects = await Project.find({
    tenantId,
    endDate: { $lt: startOfDay(now) },
    status: { $in: ["active", "planning"] }
  }).select("_id name endDate").lean();

  for (const project of projects) {
    const current = await createSmartAlert({
      tenantId,
      title: "Projeto atrasado",
      message: `${project.name || "Projeto"} está atrasado desde ${new Date(project.endDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: "high",
      module: "projects",
      referenceType: "project_overdue",
      referenceId: project._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkAssetsInLongMaintenance({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const limitDate = startOfDay(addDays(startOfDay(now), -7));
  const [maintenanceAssets, lostAssets] = await Promise.all([
    Asset.find({
      tenantId,
      status: "maintenance",
      updatedAt: { $lt: limitDate }
    }).select("_id name").lean(),
    Asset.find({
      tenantId,
      status: "lost"
    }).select("_id name").lean()
  ]);

  for (const asset of maintenanceAssets) {
    const current = await createSmartAlert({
      tenantId,
      title: "Patrimônio em manutenção prolongada",
      message: `${asset.name || "Patrimônio"} está em manutenção há mais de 7 dias.`,
      type: "warning",
      severity: "medium",
      module: "assets",
      referenceType: "asset_long_maintenance",
      referenceId: asset._id
    });
    mergeSummary(summary, current);
  }

  for (const asset of lostAssets) {
    const current = await createSmartAlert({
      tenantId,
      title: "Patrimônio perdido",
      message: `${asset.name || "Patrimônio"} está marcado como perdido.`,
      type: "error",
      severity: "high",
      module: "assets",
      referenceType: "asset_lost",
      referenceId: asset._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkOverdueFinancialTransactions({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const transactions = await FinancialTransaction.find({
    tenantId,
    type: { $in: ["expense", "income"] },
    status: { $in: ["pending", "overdue"] },
    dueDate: { $lt: startOfDay(now) }
  }).select("_id type description dueDate amount").lean();

  for (const transaction of transactions) {
    const isExpense = transaction.type === "expense";
    const current = await createSmartAlert({
      tenantId,
      title: isExpense ? "Despesa vencida" : "Receita vencida",
      message: `${transaction.description || (isExpense ? "Despesa" : "Receita")} venceu em ${new Date(transaction.dueDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: isExpense ? "high" : "medium",
      module: "financial",
      referenceType: "financial_overdue",
      referenceId: transaction._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkNegativeCashBalance({ tenantId }) {
  const summary = buildSummary();
  const paidTransactions = await FinancialTransaction.find({
    tenantId,
    status: "paid",
    type: { $in: ["income", "expense"] }
  }).select("type amount").lean();

  const cashBalance = paidTransactions.reduce((acc, item) => acc + (item.type === "income" ? Number(item.amount || 0) : -Number(item.amount || 0)), 0);
  if (cashBalance >= 0) return summary;

  const current = await createSmartAlert({
    tenantId,
    title: "Saldo em caixa negativo",
    message: `O saldo em caixa está negativo em R$ ${formatMoney(Math.abs(cashBalance))}.`,
    type: "error",
    severity: "critical",
    module: "financial",
    referenceType: "financial_negative_cash_balance",
    referenceId: tenantId,
    dedupeSuffix: startOfDay(new Date()).toISOString().slice(0, 10)
  });
  mergeSummary(summary, current);

  return summary;
}

async function checkSaasSubscriptionsExpiringSoon({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const today = startOfDay(now);
  const soon = endOfDay(addDays(today, 7));
  const subscriptions = await TenantSubscription.find({
    tenantId,
    nextBillingDate: { $gte: today, $lte: soon },
    status: { $in: ["active", "trialing"] }
  }).select("_id nextBillingDate").lean();

  for (const subscription of subscriptions) {
    const current = await createSmartAlert({
      tenantId,
      title: "Assinatura vencendo em breve",
      message: `A assinatura SaaS vence em ${new Date(subscription.nextBillingDate).toLocaleDateString("pt-BR")}.`,
      type: "warning",
      severity: "medium",
      module: "saas",
      referenceType: "saas_expiring_soon",
      referenceId: subscription._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function checkSaasSubscriptionsOverdue({ tenantId, now = new Date() }) {
  const summary = buildSummary();
  const subscriptions = await TenantSubscription.find({
    tenantId,
    nextBillingDate: { $lt: startOfDay(now) },
    status: "overdue"
  }).select("_id nextBillingDate").lean();

  for (const subscription of subscriptions) {
    const current = await createSmartAlert({
      tenantId,
      title: "Assinatura vencida",
      message: `A assinatura SaaS está vencida desde ${new Date(subscription.nextBillingDate).toLocaleDateString("pt-BR")}.`,
      type: "error",
      severity: "critical",
      module: "saas",
      referenceType: "saas_overdue",
      referenceId: subscription._id
    });
    mergeSummary(summary, current);
  }

  return summary;
}

async function runSmartAlerts(options = {}) {
  const summary = buildSummary();
  const now = options.now || new Date();

  let tenantIds = [];
  if (options.tenantId) {
    tenantIds = [normalizeId(options.tenantId)].filter(Boolean);
  } else {
    const tenants = await Tenant.find({ status: "active" }).select("_id").lean();
    tenantIds = tenants.map((item) => normalizeId(item._id)).filter(Boolean);
  }

  for (const tenantId of tenantIds) {
    const checks = [
      checkOverdueProtocols,
      checkUrgentProtocolsWithoutResponsible,
      checkProjectsEndingSoon,
      checkOverdueProjects,
      checkAssetsInLongMaintenance,
      checkOverdueFinancialTransactions,
      checkNegativeCashBalance,
      checkSaasSubscriptionsExpiringSoon,
      checkSaasSubscriptionsOverdue
    ];

    for (const check of checks) {
      try {
        const result = await check({ tenantId, now });
        mergeSummary(summary, result);
      } catch (_error) {
        summary.errors += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  SMART_ALERT_REFERENCE_TYPES,
  runSmartAlerts,
  checkOverdueProtocols,
  checkUrgentProtocolsWithoutResponsible,
  checkProjectsEndingSoon,
  checkOverdueProjects,
  checkAssetsInLongMaintenance,
  checkOverdueFinancialTransactions,
  checkNegativeCashBalance,
  checkSaasSubscriptionsExpiringSoon,
  checkSaasSubscriptionsOverdue
};
