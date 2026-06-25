const mongoose = require("mongoose");

const Associate = require("../../models/Associate");
const Asset = require("../../models/Asset");
const FinancialTransaction = require("../../models/FinancialTransaction");
const Invoice = require("../../models/Invoice");
const Notification = require("../../models/Notification");
const Project = require("../../models/Project");
const Protocol = require("../../models/Protocol");

const OPEN_PROTOCOL_STATUSES = ["open", "in_progress", "waiting"];
const ACTIVE_PROJECT_STATUSES = ["planning", "active", "paused"];

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function toTenantObjectId(tenantId) {
  const value = String(tenantId || "");
  return mongoose.Types.ObjectId.isValid(value) ? mongoose.Types.ObjectId.createFromHexString(value) : tenantId;
}

async function sumTransactions(tenantId, match) {
  const result = await FinancialTransaction.aggregate([
    { $match: { tenantId: toTenantObjectId(tenantId), ...match } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  return roundMoney(result[0]?.total || 0);
}

async function sumInvoices(tenantId, match) {
  const result = await Invoice.aggregate([
    { $match: { tenantId: toTenantObjectId(tenantId), ...match } },
    { $group: { _id: null, total: { $sum: "$amountCurrent" }, count: { $sum: 1 } } }
  ]);
  return { total: roundMoney(result[0]?.total || 0), count: result[0]?.count || 0 };
}

function serializeProject(project) {
  return {
    id: project._id,
    name: project.name || "",
    status: project.status || "",
    endDate: project.endDate || null,
    responsibleName: project.responsibleName || "",
    budget: project.budget || 0,
    spent: project.spent || 0
  };
}

function serializeAsset(asset) {
  return {
    id: asset._id,
    assetCode: asset.assetCode || "",
    name: asset.name || "",
    status: asset.status || "",
    responsibleName: asset.responsibleName || "",
    location: asset.location || "",
    currentValue: asset.currentValue || 0
  };
}

function serializeInvoice(invoice) {
  return {
    id: invoice._id,
    description: invoice.description || "",
    amountCurrent: invoice.amountCurrent || 0,
    dueDate: invoice.dueDate || null,
    status: invoice.status || "",
    associateId: invoice.associateId || null
  };
}

async function buildExecutiveContext({ tenantId, userId, now = new Date() }) {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const today = startOfDay(now);
  const overdueInvoiceFilter = {
    status: { $in: ["pending", "overdue"] },
    dueDate: { $lt: today }
  };
  const delayedProjectFilter = {
    status: { $in: ACTIVE_PROJECT_STATUSES },
    endDate: { $lt: today }
  };

  const [
    receitaMes,
    despesaMes,
    receitaTotal,
    despesaTotal,
    inadimplencia,
    protocolosAbertos,
    projetosAtivos,
    projetosAtrasados,
    patrimonioTotal,
    patrimonioValor,
    alertasCriticos,
    notificacoesNaoLidas,
    associados,
    projetosAtrasadosLista,
    patrimoniosManutencao,
    cobrancasVencidas
  ] = await Promise.all([
    sumTransactions(tenantId, { type: "income", status: "paid", paidAt: { $gte: monthStart, $lte: monthEnd } }),
    sumTransactions(tenantId, { type: "expense", status: "paid", paidAt: { $gte: monthStart, $lte: monthEnd } }),
    sumTransactions(tenantId, { type: "income", status: "paid" }),
    sumTransactions(tenantId, { type: "expense", status: "paid" }),
    sumInvoices(tenantId, overdueInvoiceFilter),
    Protocol.countDocuments({ tenantId, status: { $in: OPEN_PROTOCOL_STATUSES } }),
    Project.countDocuments({ tenantId, status: "active" }),
    Project.countDocuments({ tenantId, ...delayedProjectFilter }),
    Asset.countDocuments({ tenantId }),
    Asset.aggregate([
      { $match: { tenantId: toTenantObjectId(tenantId) } },
      { $group: { _id: null, total: { $sum: "$currentValue" } } }
    ]),
    Notification.countDocuments({ tenantId, severity: "critical", isRead: false }),
    Notification.countDocuments({ tenantId, userId, isRead: false }),
    Associate.countDocuments({ tenantId }),
    Project.find({ tenantId, ...delayedProjectFilter }).sort({ endDate: 1 }).limit(10).lean(),
    Asset.find({ tenantId, status: "maintenance" }).sort({ updatedAt: -1 }).limit(10).lean(),
    Invoice.find({ tenantId, ...overdueInvoiceFilter }).sort({ dueDate: 1 }).limit(10).lean()
  ]);

  const saldo = roundMoney(receitaTotal - despesaTotal);
  return {
    period: {
      month: monthStart.toISOString().slice(0, 7),
      start: monthStart,
      end: monthEnd
    },
    receitaMes,
    despesaMes,
    saldo,
    inadimplencia,
    protocolosAbertos,
    projetosAtivos,
    projetosAtrasados,
    patrimonioTotal: {
      count: patrimonioTotal,
      value: roundMoney(patrimonioValor[0]?.total || 0)
    },
    alertasCriticos,
    notificacoesNaoLidas,
    associados,
    listas: {
      projetosAtrasados: projetosAtrasadosLista.map(serializeProject),
      patrimoniosManutencao: patrimoniosManutencao.map(serializeAsset),
      cobrancasVencidas: cobrancasVencidas.map(serializeInvoice)
    }
  };
}

module.exports = {
  ACTIVE_PROJECT_STATUSES,
  OPEN_PROTOCOL_STATUSES,
  buildExecutiveContext,
  roundMoney,
  startOfDay,
  startOfMonth,
  endOfMonth,
  toTenantObjectId
};
