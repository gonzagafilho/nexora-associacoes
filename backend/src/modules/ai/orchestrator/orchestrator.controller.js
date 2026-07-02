const orchestratorService = require("./orchestrator.service");

function contextFromRequest(req) {
  return {
    tenantId: req.user.tenantId,
    userId: req.user.id,
    userRole: req.user.role,
    userEmail: req.user.email,
    enabledModules: req.user.enabledModules
  };
}

async function getStatus(req, res) {
  try {
    const status = orchestratorService.statusSummary({ tenantId: req.user.tenantId });
    return res.json({ ok: true, ...status });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao obter status do Orchestrator." });
  }
}

async function createPlan(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const question = String(payload.question || payload.message || "").trim();
    if (!question && !Array.isArray(payload.steps)) {
      return res.status(400).json({ ok: false, message: "Pergunta ou steps são obrigatórios para planejar." });
    }

    const result = await orchestratorService.plan({
      ...contextFromRequest(req),
      question,
      projectKey: payload.projectKey,
      input: payload
    });

    if (result.policy?.blocked) {
      return res.status(result.policy.code || 403).json({
        ok: false,
        message: result.policy.reasons?.[0] || "Plano bloqueado pela Policy Engine.",
        policy: result.policy,
        plan: result.plan
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar plano." });
  }
}

async function executePlan(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const planId = String(payload.planId || "").trim();
    if (!planId) return res.status(400).json({ ok: false, message: "planId é obrigatório para execução." });

    const result = await orchestratorService.execute({
      ...contextFromRequest(req),
      planId,
      confirm: Boolean(payload.confirm)
    });

    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao executar plano." });
  }
}

async function listPlans(req, res) {
  try {
    const plans = orchestratorService.listPlans({ tenantId: req.user.tenantId, query: req.query || {} });
    return res.json({ ok: true, total: plans.length, plans });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao listar planos." });
  }
}

async function getPlan(req, res) {
  try {
    const plan = orchestratorService.getPlan({ tenantId: req.user.tenantId, id: req.params.id });
    if (!plan) return res.status(404).json({ ok: false, message: "Plano não encontrado." });
    return res.json({ ok: true, plan });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao buscar plano." });
  }
}

module.exports = {
  getStatus,
  createPlan,
  executePlan,
  listPlans,
  getPlan
};
