const Project = require("../../models/Project");
const FinancialTransaction = require("../../models/FinancialTransaction");

const PROJECT_TYPES = ["obra", "projeto", "evento", "campanha", "outro"];
const PROJECT_STATUSES = ["planning", "active", "paused", "completed", "cancelled"];
const BUDGET_CATEGORIES = ["mao_de_obra", "material", "servico", "equipamento", "deslocamento", "outro"];

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f0-9]{24}$/i.test(id) ? id : "";
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeBudgetItem(item = {}) {
  const description = String(item.description || "").trim();
  const category = String(item.category || "outro").trim();
  const unit = String(item.unit || "unidade").trim() || "unidade";
  const notes = String(item.notes || "").trim();

  const quantity = Math.max(0, toNumber(item.quantity, 1));
  const unitMaterialCost = Math.max(0, roundMoney(toNumber(item.unitMaterialCost, 0)));
  const unitLaborCost = Math.max(0, roundMoney(toNumber(item.unitLaborCost, 0)));
  const totalMaterialCost = roundMoney(quantity * unitMaterialCost);
  const totalLaborCost = roundMoney(quantity * unitLaborCost);
  const totalCost = roundMoney(totalMaterialCost + totalLaborCost);

  const saleCandidate = toNumber(item.salePrice, Number.NaN);
  const salePrice = Number.isFinite(saleCandidate) ? Math.max(0, roundMoney(saleCandidate)) : totalCost;
  const profit = roundMoney(salePrice - totalCost);

  return {
    description,
    category: BUDGET_CATEGORIES.includes(category) ? category : "outro",
    quantity,
    unit,
    unitMaterialCost,
    unitLaborCost,
    totalMaterialCost,
    totalLaborCost,
    totalCost,
    salePrice,
    profit,
    notes
  };
}

function normalizeBudgetItems(items) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) {
    const error = new Error("Itens de orçamento inválidos.");
    error.statusCode = 400;
    throw error;
  }
  return items.map((item) => normalizeBudgetItem(item));
}

function calculateBudgetTotals(budgetItems = []) {
  const totals = budgetItems.reduce((acc, item) => {
    acc.materialTotal += Number(item.totalMaterialCost || 0);
    acc.laborTotal += Number(item.totalLaborCost || 0);
    acc.costTotal += Number(item.totalCost || 0);
    acc.saleTotal += Number(item.salePrice || 0);
    acc.profitTotal += Number(item.profit || 0);
    return acc;
  }, { materialTotal: 0, laborTotal: 0, costTotal: 0, saleTotal: 0, profitTotal: 0 });

  totals.materialTotal = roundMoney(totals.materialTotal);
  totals.laborTotal = roundMoney(totals.laborTotal);
  totals.costTotal = roundMoney(totals.costTotal);
  totals.saleTotal = roundMoney(totals.saleTotal);
  totals.profitTotal = roundMoney(totals.profitTotal);
  totals.profitMarginPercent = totals.saleTotal > 0
    ? roundMoney((totals.profitTotal / totals.saleTotal) * 100)
    : 0;
  return totals;
}

function buildProjectPayload(body = {}, existing = {}) {
  const type = String(body.type ?? existing.type ?? "projeto");
  if (!PROJECT_TYPES.includes(type)) {
    const error = new Error("Tipo de projeto inválido.");
    error.statusCode = 400;
    throw error;
  }
  const status = String(body.status ?? existing.status ?? "planning");
  if (!PROJECT_STATUSES.includes(status)) {
    const error = new Error("Status do projeto inválido.");
    error.statusCode = 400;
    throw error;
  }
  const name = String(body.name ?? existing.name ?? "").trim();
  if (!name) {
    const error = new Error("Nome do projeto é obrigatório.");
    error.statusCode = 400;
    throw error;
  }
  const hasBudgetItems = body.budgetItems !== undefined;
  const normalizedBudgetItems = normalizeBudgetItems(hasBudgetItems ? body.budgetItems : (existing.budgetItems || []));
  const budgetTotals = calculateBudgetTotals(normalizedBudgetItems);
  const fallbackBudget = hasBudgetItems ? budgetTotals.saleTotal : (existing.budget ?? 0);
  const budget = roundMoney(body.budget ?? fallbackBudget);
  if (budget < 0) {
    const error = new Error("Orçamento inválido.");
    error.statusCode = 400;
    throw error;
  }
  const startDate = body.startDate !== undefined ? normalizeDate(body.startDate) : (existing.startDate || null);
  const endDate = body.endDate !== undefined ? normalizeDate(body.endDate) : (existing.endDate || null);
  if (body.startDate && !startDate) {
    const error = new Error("Data de início inválida.");
    error.statusCode = 400;
    throw error;
  }
  if (body.endDate && !endDate) {
    const error = new Error("Data de fim inválida.");
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    description: String(body.description ?? existing.description ?? "").trim(),
    type,
    status,
    startDate,
    endDate,
    budget,
    budgetItems: normalizedBudgetItems,
    materialTotal: budgetTotals.materialTotal,
    laborTotal: budgetTotals.laborTotal,
    costTotal: budgetTotals.costTotal,
    saleTotal: budgetTotals.saleTotal,
    profitTotal: budgetTotals.profitTotal,
    profitMarginPercent: budgetTotals.profitMarginPercent,
    responsibleName: String(body.responsibleName ?? existing.responsibleName ?? "").trim(),
    responsiblePhone: String(body.responsiblePhone ?? existing.responsiblePhone ?? "").trim(),
    location: String(body.location ?? existing.location ?? "").trim(),
    notes: String(body.notes ?? existing.notes ?? "").trim()
  };
}

async function calculateProjectSpent({ tenantId, projectId }) {
  const id = normalizeObjectId(projectId);
  if (!id) return 0;
  const expenses = await FinancialTransaction.find({ tenantId, projectId: id, type: "expense", status: "paid" }).lean();
  return roundMoney(expenses.reduce((total, item) => total + Number(item.amount || 0), 0));
}

async function syncProjectSpent({ tenantId, projectId }) {
  const id = normalizeObjectId(projectId);
  if (!id) return null;
  const spent = await calculateProjectSpent({ tenantId, projectId: id });
  await Project.findOneAndUpdate({ _id: id, tenantId }, { $set: { spent } }, { new: false }).catch(() => null);
  return spent;
}

function serializeProject(project) {
  const source = project?.toObject ? project.toObject() : (project || {});
  const budget = roundMoney(source.budget || 0);
  const spent = roundMoney(source.spent || 0);
  const budgetItems = normalizeBudgetItems(source.budgetItems || []);
  const totals = calculateBudgetTotals(budgetItems);
  return {
    id: source._id,
    tenantId: source.tenantId,
    name: source.name || "",
    description: source.description || "",
    type: source.type || "projeto",
    status: source.status || "planning",
    startDate: source.startDate || null,
    endDate: source.endDate || null,
    budget,
    budgetItems,
    materialTotal: totals.materialTotal,
    laborTotal: totals.laborTotal,
    costTotal: totals.costTotal,
    saleTotal: totals.saleTotal,
    profitTotal: totals.profitTotal,
    profitMarginPercent: totals.profitMarginPercent,
    spent,
    remainingBudget: roundMoney(budget - spent),
    responsibleName: source.responsibleName || "",
    responsiblePhone: source.responsiblePhone || "",
    location: source.location || "",
    notes: source.notes || "",
    createdBy: source.createdBy || null,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

module.exports = {
  PROJECT_TYPES,
  PROJECT_STATUSES,
  BUDGET_CATEGORIES,
  buildProjectPayload,
  calculateBudgetTotals,
  calculateProjectSpent,
  normalizeBudgetItems,
  normalizeObjectId,
  serializeProject,
  syncProjectSpent
};
