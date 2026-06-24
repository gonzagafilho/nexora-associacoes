const express = require("express");

const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const Project = require("../../models/Project");
const FinancialTransaction = require("../../models/FinancialTransaction");
const {
  buildProjectPayload,
  calculateBudgetTotals,
  normalizeBudgetItems,
  normalizeObjectId,
  serializeProject,
  syncProjectSpent
} = require("../../services/projects/projectService");

const router = express.Router();
const projectsAccess = [auth, requireModule("projects")];

function buildQuery(req) {
  const query = { tenantId: req.user.tenantId };
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.type) query.type = String(req.query.type);
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(q.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"), "i");
    query.$or = [
      { name: regex },
      { description: regex },
      { responsibleName: regex },
      { location: regex }
    ];
  }
  return query;
}

async function findProjectOr404(req, res) {
  const project = await Project.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!project) {
    res.status(404).json({ ok: false, message: "Projeto não encontrado." });
    return null;
  }
  return project;
}

router.get("/dashboard", projectsAccess, async (req, res) => {
  const projects = await Project.find({ tenantId: req.user.tenantId }).lean();
  const totals = projects.reduce((acc, item) => {
    acc.totalProjects += 1;
    if (item.status === "active") acc.activeProjects += 1;
    if (item.status === "completed") acc.completedProjects += 1;
    if (item.status === "paused") acc.pausedProjects += 1;
    acc.totalBudget += Number(item.budget || 0);
    acc.materialTotal += Number(item.materialTotal || 0);
    acc.laborTotal += Number(item.laborTotal || 0);
    acc.costTotal += Number(item.costTotal || 0);
    acc.saleTotal += Number(item.saleTotal || 0);
    acc.profitTotal += Number(item.profitTotal || 0);
    acc.totalSpent += Number(item.spent || 0);
    return acc;
  }, {
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    pausedProjects: 0,
    totalBudget: 0,
    materialTotal: 0,
    laborTotal: 0,
    costTotal: 0,
    saleTotal: 0,
    profitTotal: 0,
    totalSpent: 0
  });
  totals.totalBudget = Number(totals.totalBudget.toFixed(2));
  totals.materialTotal = Number(totals.materialTotal.toFixed(2));
  totals.laborTotal = Number(totals.laborTotal.toFixed(2));
  totals.costTotal = Number(totals.costTotal.toFixed(2));
  totals.saleTotal = Number(totals.saleTotal.toFixed(2));
  totals.profitTotal = Number(totals.profitTotal.toFixed(2));
  totals.profitMarginPercent = totals.saleTotal > 0
    ? Number(((totals.profitTotal / totals.saleTotal) * 100).toFixed(2))
    : 0;
  totals.totalSpent = Number(totals.totalSpent.toFixed(2));
  return res.json({ ok: true, ...totals });
});

router.get("/", projectsAccess, async (req, res) => {
  const projects = await Project.find(buildQuery(req)).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ ok: true, projects: projects.map(serializeProject) });
});

router.get("/:id/report", projectsAccess, async (req, res) => {
  const project = await findProjectOr404(req, res);
  if (!project) return;
  const projectId = String(project._id);
  const tenantId = req.user.tenantId;
  const spent = await syncProjectSpent({ tenantId, projectId });
  if (spent !== null) project.spent = spent;
  const expenses = await FinancialTransaction.find({ tenantId, projectId, type: "expense" }).sort({ dueDate: -1, createdAt: -1 }).lean();
  const paidExpenses = expenses.filter((item) => item.status === "paid");
  const pendingExpenses = expenses.filter((item) => item.status === "pending");
  const cancelledExpenses = expenses.filter((item) => item.status === "cancelled");
  const totalSpent = Number((project.spent || 0).toFixed(2));
  const totalBudget = Number((project.budget || 0).toFixed(2));
  const materialTotal = Number((project.materialTotal || 0).toFixed(2));
  const laborTotal = Number((project.laborTotal || 0).toFixed(2));
  const costTotal = Number((project.costTotal || 0).toFixed(2));
  const saleTotal = Number((project.saleTotal || 0).toFixed(2));
  const profitTotal = Number((project.profitTotal || 0).toFixed(2));
  const profitMarginPercent = Number((project.profitMarginPercent || 0).toFixed(2));
  const estimatedProfitVsRealSpend = Number((saleTotal - totalSpent).toFixed(2));
  const costVarianceVsRealSpend = Number((totalSpent - costTotal).toFixed(2));
  return res.json({
    ok: true,
    project: serializeProject(project),
    budget: {
      items: (project.budgetItems || []).map((item) => ({
        description: item.description || "",
        category: item.category || "outro",
        quantity: Number(item.quantity || 0),
        unit: item.unit || "unidade",
        unitMaterialCost: Number(item.unitMaterialCost || 0),
        unitLaborCost: Number(item.unitLaborCost || 0),
        totalMaterialCost: Number(item.totalMaterialCost || 0),
        totalLaborCost: Number(item.totalLaborCost || 0),
        totalCost: Number(item.totalCost || 0),
        salePrice: Number(item.salePrice || 0),
        profit: Number(item.profit || 0),
        notes: item.notes || ""
      }))
    },
    expenses: expenses.map((item) => ({
      id: item._id,
      category: item.category || "",
      description: item.description || "",
      amount: Number(item.amount || 0),
      dueDate: item.dueDate || null,
      paidAt: item.paidAt || null,
      status: item.status || "pending",
      supplierName: item.supplierName || "",
      paymentMethod: item.paymentMethod || "other",
      notes: item.notes || ""
    })),
    summary: {
      totalBudget,
      materialTotal,
      laborTotal,
      costTotal,
      saleTotal,
      profitTotal,
      profitMarginPercent,
      totalSpent,
      remainingBudget: Number((totalBudget - totalSpent).toFixed(2)),
      estimatedProfitVsRealSpend,
      costVarianceVsRealSpend,
      paidExpenses: paidExpenses.length,
      pendingExpenses: pendingExpenses.length,
      cancelledExpenses: cancelledExpenses.length,
      expenseCount: expenses.length
    }
  });
});

router.get("/:id", projectsAccess, async (req, res) => {
  const project = await findProjectOr404(req, res);
  if (!project) return;
  const spent = await syncProjectSpent({ tenantId: req.user.tenantId, projectId: String(project._id) });
  if (spent !== null) project.spent = spent;
  return res.json({ ok: true, project: serializeProject(project) });
});

router.post("/", projectsAccess, async (req, res) => {
  try {
    const payload = buildProjectPayload(req.body || {});
    payload.tenantId = req.user.tenantId;
    payload.createdBy = req.user.id;
    const project = await Project.create(payload);
    return res.status(201).json({ ok: true, project: serializeProject(project) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar projeto." });
  }
});

router.put("/:id", projectsAccess, async (req, res) => {
  try {
    const project = await findProjectOr404(req, res);
    if (!project) return;
    const payload = buildProjectPayload(req.body || {}, project);
    Object.assign(project, payload);
    await project.save();
    return res.json({ ok: true, project: serializeProject(project) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar projeto." });
  }
});

router.put("/:id/budget", projectsAccess, async (req, res) => {
  try {
    const project = await findProjectOr404(req, res);
    if (!project) return;
    const budgetItems = normalizeBudgetItems(req.body?.budgetItems);
    const totals = calculateBudgetTotals(budgetItems);
    project.budgetItems = budgetItems;
    project.materialTotal = totals.materialTotal;
    project.laborTotal = totals.laborTotal;
    project.costTotal = totals.costTotal;
    project.saleTotal = totals.saleTotal;
    project.profitTotal = totals.profitTotal;
    project.profitMarginPercent = totals.profitMarginPercent;
    project.budget = totals.saleTotal;
    await project.save();
    return res.json({ ok: true, project: serializeProject(project), totals });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar orçamento." });
  }
});

router.post("/:id/complete", projectsAccess, async (req, res) => {
  const project = await findProjectOr404(req, res);
  if (!project) return;
  project.status = "completed";
  if (!project.endDate) project.endDate = new Date();
  await project.save();
  return res.json({ ok: true, project: serializeProject(project) });
});

router.post("/:id/cancel", projectsAccess, async (req, res) => {
  const project = await findProjectOr404(req, res);
  if (!project) return;
  project.status = "cancelled";
  await project.save();
  return res.json({ ok: true, project: serializeProject(project) });
});

router.delete("/:id", projectsAccess, async (req, res) => {
  const project = await Project.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!project) return res.status(404).json({ ok: false, message: "Projeto não encontrado." });
  await FinancialTransaction.updateMany({ tenantId: req.user.tenantId, projectId: project._id }, { $unset: { projectId: 1 } }).catch(() => null);
  return res.json({ ok: true, project: serializeProject(project) });
});

module.exports = router;
