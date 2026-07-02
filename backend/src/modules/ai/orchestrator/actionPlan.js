const { randomUUID } = require("node:crypto");

function normalizeStep(step = {}) {
  return {
    skill: String(step.skill || "").trim(),
    payload: step.payload && typeof step.payload === "object" ? step.payload : {},
    requiresConfirmation: Boolean(step.requiresConfirmation),
    status: String(step.status || "pending").trim() || "pending",
    startedAt: step.startedAt || null,
    finishedAt: step.finishedAt || null,
    durationMs: Number(step.durationMs || 0),
    errorMessage: String(step.errorMessage || "").trim(),
    result: step.result || null
  };
}

function createActionPlan({ tenantId, userId, projectKey, question, intent, steps = [], metadata = {} }) {
  if (!tenantId) {
    const error = new Error("tenantId é obrigatório para o plano.");
    error.statusCode = 400;
    throw error;
  }
  if (!userId) {
    const error = new Error("userId é obrigatório para o plano.");
    error.statusCode = 400;
    throw error;
  }
  if (!projectKey) {
    const error = new Error("projectKey é obrigatório para o plano.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedSteps = Array.isArray(steps) ? steps.map(normalizeStep).filter((step) => step.skill) : [];

  return {
    id: randomUUID(),
    tenantId: String(tenantId),
    userId: String(userId),
    projectKey: String(projectKey || "associacoes").trim().toLowerCase() || "associacoes",
    question: String(question || "").trim(),
    intent: String(intent || "general_orchestration").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "planned",
    steps: normalizedSteps,
    totalDurationMs: 0,
    success: false,
    errorMessage: "",
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  };
}

module.exports = {
  createActionPlan,
  normalizeStep
};
