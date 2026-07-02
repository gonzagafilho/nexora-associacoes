const express = require("express");
const { buildMonthlyFinancialReport } = require("../../services/financial/monthlyFinancialReportService");
const { generateMonthlyFinancialReportPdf } = require("../../services/financial/monthlyFinancialReportPdfService");
const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const FinancialTransaction = require("../../models/FinancialTransaction");
const Project = require("../../models/Project");
const { buildEventContext, publishOsEvent } = require("../../os/osEventPublisher");
const { syncProjectSpent } = require("../../services/projects/projectService");

const router = express.Router();
const financialAccess = [auth, requireModule("financial")];

const TYPES = new Set(["income", "expense"]);
const STATUSES = new Set(["pending", "paid", "cancelled", "overdue"]);
const PAYMENT_METHODS = new Set(["pix", "cash", "bank_transfer", "card", "boleto", "other"]);
const REFERENCE_TYPES = new Set(["invoice", "manual", "supplier", "adjustment"]);

async function publishFinancialEvent(req, eventName, transaction, action) {
  try {
    await publishOsEvent(eventName, {
      module: "financial",
      action,
      entityId: transaction?._id,
      entityType: "FinancialTransaction",
      payload: {
        type: transaction?.type,
        category: transaction?.category,
        status: transaction?.status,
        amount: Number(transaction?.amount || 0)
      }
    }, buildEventContext(req));
  } catch (_error) {
    // never break primary flow
  }
}

function toPositiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f0-9]{24}$/i.test(id) ? id : "";
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

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildPayload(req, existing = {}) {
  const amount = Number(req.body?.amount ?? existing.amount ?? 0);
  if (!amount || amount <= 0) throw createHttpError("Valor deve ser maior que zero.");

  const type = req.body?.type ?? existing.type;
  if (!TYPES.has(type)) throw createHttpError("Tipo de transação inválido.");

  const status = req.body?.status ?? existing.status ?? "pending";
  if (!STATUSES.has(status)) throw createHttpError("Status inválido.");

  const paymentMethod = req.body?.paymentMethod ?? existing.paymentMethod ?? "other";
  if (!PAYMENT_METHODS.has(paymentMethod)) throw createHttpError("Forma de pagamento inválida.");

  const referenceType = req.body?.referenceType ?? existing.referenceType ?? "manual";
  if (!REFERENCE_TYPES.has(referenceType)) throw createHttpError("Tipo de referência inválido.");

  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : existing.dueDate || new Date();
  if (Number.isNaN(new Date(dueDate).getTime())) throw createHttpError("Vencimento inválido.");

  const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : existing.paidAt;
  if (paidAt && Number.isNaN(new Date(paidAt).getTime())) throw createHttpError("Data de pagamento inválida.");

  const referenceId = req.body?.referenceId !== undefined
    ? normalizeObjectId(req.body.referenceId) || undefined
    : existing.referenceId;
  const projectIdInput = req.body?.projectId !== undefined ? req.body.projectId : existing.projectId;
  const projectId = projectIdInput ? normalizeObjectId(projectIdInput) : undefined;
  if (req.body?.projectId !== undefined && req.body.projectId && !projectId) {
    throw createHttpError("Projeto inválido.");
  }
  if (projectId && type !== "expense") throw createHttpError("Projeto só pode ser vinculado a saídas.");

  return {
    type,
    category: String(req.body?.category ?? existing.category ?? "").trim(),
    description: String(req.body?.description ?? existing.description ?? "").trim(),
    amount: roundMoney(amount),
    dueDate,
    paidAt: status === "paid" && !paidAt ? new Date() : paidAt,
    status,
    paymentMethod,
    projectId,
    referenceType,
    referenceId,
    supplierName: String(req.body?.supplierName ?? existing.supplierName ?? "").trim(),
    notes: String(req.body?.notes ?? existing.notes ?? "").trim()
  };
}

async function validateProjectForTenant(tenantId, projectId) {
  if (!projectId) return null;
  const project = await Project.findOne({ _id: projectId, tenantId });
  if (!project) throw createHttpError("Projeto não encontrado.", 404);
  return project;
}

async function syncAffectedProjects(tenantId, ...projectIds) {
  const unique = [...new Set(projectIds.map((value) => normalizeObjectId(value)).filter(Boolean))];
  await Promise.all(unique.map((projectId) => syncProjectSpent({ tenantId, projectId })));
}

function validateRequired(payload) {
  if (!payload.category) throw createHttpError("Categoria é obrigatória.");
  if (!payload.description) throw createHttpError("Descrição é obrigatória.");
}

function buildTransactionFilter(query, tenantId) {
  const filter = { tenantId };
  if (query.type && TYPES.has(String(query.type))) filter.type = String(query.type);
  if (query.status && STATUSES.has(String(query.status))) filter.status = String(query.status);
  if (query.category) filter.category = String(query.category);
  if (query.dateFrom || query.dateTo) {
    filter.dueDate = {};
    if (query.dateFrom) filter.dueDate.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999);
      filter.dueDate.$lte = to;
    }
  }
  const q = String(query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    filter.$or = [
      { category: regex },
      { description: regex },
      { supplierName: regex },
      { notes: regex }
    ];
  }
  return filter;
}

function serialize(transaction) {
  return {
    id: transaction._id,
    tenantId: transaction.tenantId,
    type: transaction.type,
    category: transaction.category,
    description: transaction.description,
    amount: transaction.amount || 0,
    dueDate: transaction.dueDate || null,
    paidAt: transaction.paidAt || null,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    projectId: transaction.projectId || null,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId || null,
    supplierName: transaction.supplierName || "",
    notes: transaction.notes || "",
    createdBy: transaction.createdBy || null,
    createdAt: transaction.createdAt || null,
    updatedAt: transaction.updatedAt || null
  };
}


router.get("/reports/monthly", financialAccess, async (req, res) => {
  try {
    const report = await buildMonthlyFinancialReport({ tenantId: req.user.tenantId, month: req.query.month });
    return res.json(report);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao gerar prestação de contas." });
  }
});

router.get("/reports/monthly/pdf", financialAccess, async (req, res) => {
  try {
    const report = await buildMonthlyFinancialReport({ tenantId: req.user.tenantId, month: req.query.month });
    const pdf = await generateMonthlyFinancialReportPdf(report);
    const encodedMonth = encodeURIComponent(report.period.month);
    return res.json({
      ok: true,
      reportUrl: "/api/financial/reports/monthly/pdf/download?month=" + encodedMonth,
      filename: pdf.filename,
      month: report.period.month
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao gerar PDF da prestação de contas." });
  }
});

router.get("/reports/monthly/pdf/download", financialAccess, async (req, res) => {
  try {
    const report = await buildMonthlyFinancialReport({ tenantId: req.user.tenantId, month: req.query.month });
    const pdf = await generateMonthlyFinancialReportPdf(report);
    return res.download(pdf.filepath, pdf.filename);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao baixar PDF da prestação de contas." });
  }
});

router.get("/summary", financialAccess, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const transactions = await FinancialTransaction.find({ tenantId }).lean();
    let monthStart = startOfMonth();
    let monthEnd = endOfMonth();
    const today = startOfDay();

    const sum = (rows) => roundMoney(rows.reduce((total, item) => total + Number(item.amount || 0), 0));
    const paid = transactions.filter((item) => item.status === "paid");
    const currentMonthPaid = paid.filter((item) => item.paidAt && new Date(item.paidAt) >= monthStart && new Date(item.paidAt) <= monthEnd);
    if (!currentMonthPaid.length && paid.some((item) => item.paidAt)) {
      const latestPaidAt = paid.reduce((latest, item) => {
        if (!item.paidAt) return latest;
        const paidAt = new Date(item.paidAt);
        if (Number.isNaN(paidAt.getTime())) return latest;
        return !latest || paidAt > latest ? paidAt : latest;
      }, null);
      if (latestPaidAt) {
        monthStart = startOfMonth(latestPaidAt);
        monthEnd = endOfMonth(latestPaidAt);
      }
    }
    const paidMonth = paid.filter((item) => item.paidAt && new Date(item.paidAt) >= monthStart && new Date(item.paidAt) <= monthEnd);
    const pending = transactions.filter((item) => item.status === "pending");
    const overdue = transactions.filter((item) => item.status === "overdue" || (item.status === "pending" && item.dueDate && startOfDay(item.dueDate) < today));

    const incomePaidMonth = sum(paidMonth.filter((item) => item.type === "income"));
    const expensePaidMonth = sum(paidMonth.filter((item) => item.type === "expense"));
    const incomePending = sum(pending.filter((item) => item.type === "income"));
    const expensePending = sum(pending.filter((item) => item.type === "expense"));
    const overdueIncomes = sum(overdue.filter((item) => item.type === "income"));
    const overdueExpenses = sum(overdue.filter((item) => item.type === "expense"));
    const cashBalance = roundMoney(sum(paid.filter((item) => item.type === "income")) - sum(paid.filter((item) => item.type === "expense")));

    return res.json({ ok: true, summary: { incomePaidMonth, expensePaidMonth, balanceMonth: roundMoney(incomePaidMonth - expensePaidMonth), incomePending, expensePending, overdueExpenses, overdueIncomes, cashBalance } });
  } catch (error) {
    console.error("[financial:summary]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao calcular resumo financeiro." });
  }
});

router.get("/transactions", financialAccess, async (req, res) => {
  const page = toPositiveInt(req.query.page, 1, 10000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = buildTransactionFilter(req.query || {}, req.user.tenantId);
  const [total, transactions] = await Promise.all([
    FinancialTransaction.countDocuments(filter),
    FinancialTransaction.find(filter).sort({ dueDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean()
  ]);
  return res.json({ ok: true, items: transactions.map(serialize), page, limit, total, totalPages: Math.ceil(total / limit) || 0 });
});

router.post("/transactions", financialAccess, async (req, res) => {
  try {
    const payload = buildPayload(req);
    validateRequired(payload);
    await validateProjectForTenant(req.user.tenantId, payload.projectId);
    payload.tenantId = req.user.tenantId;
    payload.createdBy = req.user.id;
    const transaction = await FinancialTransaction.create(payload);
    await syncAffectedProjects(req.user.tenantId, payload.projectId);
    await publishFinancialEvent(req, "financial.transaction.created", transaction, "created");
    return res.status(201).json({ ok: true, transaction: serialize(transaction) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar transação." });
  }
});

router.put("/transactions/:id", financialAccess, async (req, res) => {
  try {
    const transaction = await FinancialTransaction.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!transaction) return res.status(404).json({ ok: false, message: "Transação não encontrada." });
    if (transaction.status === "cancelled") return res.status(409).json({ ok: false, message: "Transação cancelada não pode ser alterada." });
    const previousProjectId = transaction.projectId;
    const payload = buildPayload(req, transaction);
    validateRequired(payload);
    await validateProjectForTenant(req.user.tenantId, payload.projectId);
    Object.assign(transaction, payload);
    await transaction.save();
    await syncAffectedProjects(req.user.tenantId, previousProjectId, transaction.projectId);
    return res.json({ ok: true, transaction: serialize(transaction) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar transação." });
  }
});

router.post("/transactions/:id/pay", financialAccess, async (req, res) => {
  const transaction = await FinancialTransaction.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!transaction) return res.status(404).json({ ok: false, message: "Transação não encontrada." });
  if (transaction.status === "cancelled") return res.status(409).json({ ok: false, message: "Transação cancelada não pode ser paga." });
  transaction.status = "paid";
  transaction.paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();
  if (req.body?.paymentMethod && PAYMENT_METHODS.has(req.body.paymentMethod)) transaction.paymentMethod = req.body.paymentMethod;
  await transaction.save();
  await syncAffectedProjects(req.user.tenantId, transaction.projectId);
  await publishFinancialEvent(req, "financial.transaction.paid", transaction, "paid");
  return res.json({ ok: true, transaction: serialize(transaction) });
});

router.post("/transactions/:id/cancel", financialAccess, async (req, res) => {
  const transaction = await FinancialTransaction.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!transaction) return res.status(404).json({ ok: false, message: "Transação não encontrada." });
  transaction.status = "cancelled";
  await transaction.save();
  await syncAffectedProjects(req.user.tenantId, transaction.projectId);
  await publishFinancialEvent(req, "financial.transaction.cancelled", transaction, "cancelled");
  return res.json({ ok: true, transaction: serialize(transaction) });
});

module.exports = router;
