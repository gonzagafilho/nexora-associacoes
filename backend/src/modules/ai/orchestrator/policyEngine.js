const { registry } = require("../skills/registry");

function includesRole(allowedRoles = [], userRole = "") {
  const set = new Set((Array.isArray(allowedRoles) ? allowedRoles : []).map((item) => String(item || "").trim().toLowerCase()));
  if (!set.size) return true;
  return set.has(String(userRole || "").trim().toLowerCase());
}

function evaluateStep(step = {}, context = {}, options = {}) {
  const reasons = [];
  const normalizedSkill = String(step.skill || "").trim();
  if (!normalizedSkill) {
    return { ok: false, reasons: ["Skill não informada no passo."], code: 400 };
  }

  let resolved;
  try {
    resolved = registry.resolve(normalizedSkill);
  } catch (error) {
    return { ok: false, reasons: [error.message || "Skill inexistente."], code: error.statusCode || 404 };
  }

  if (!registry.validatePermissions(resolved.skill, context)) {
    reasons.push(`Permissão insuficiente para executar ${normalizedSkill}.`);
  }

  if (!includesRole(step.allowedRoles, context.userRole)) {
    reasons.push(`Role ${context.userRole || "desconhecido"} bloqueada para ${normalizedSkill}.`);
  }

  const payloadTenantId = String(step.payload?.tenantId || "").trim();
  if (payloadTenantId && payloadTenantId !== String(context.tenantId)) {
    reasons.push(`Tenant inválido no payload para ${normalizedSkill}.`);
  }

  const phase = String(options.phase || "execution").trim();
  const requiresConfirmation = Boolean(step.requiresConfirmation || resolved.skill.confirmationRequired);
  if (phase === "execution" && requiresConfirmation && !options.confirmed) {
    reasons.push(`Confirmação obrigatória para ${normalizedSkill}.`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    code: reasons.some((item) => item.includes("Confirmação obrigatória")) ? 428 : 403,
    requiresConfirmation
  };
}

function evaluatePlan(plan = {}, context = {}, options = {}) {
  const reasons = [];

  if (!plan?.tenantId || String(plan.tenantId) !== String(context.tenantId)) {
    reasons.push("Plano bloqueado por tenant.");
  }

  if (!plan?.userId || String(plan.userId) !== String(context.userId)) {
    reasons.push("Plano bloqueado por usuário.");
  }

  if (!String(plan?.projectKey || "").trim()) {
    reasons.push("projectKey obrigatório no plano.");
  }

  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (!steps.length) {
    reasons.push("Plano sem passos para execução.");
  }

  const stepResults = steps.map((step, index) => {
    const result = evaluateStep(step, context, options);
    return {
      index,
      skill: String(step.skill || ""),
      ok: result.ok,
      reasons: result.reasons,
      code: result.code,
      requiresConfirmation: result.requiresConfirmation
    };
  });

  const blockedSteps = stepResults.filter((item) => !item.ok);
  const requiresConfirmation = stepResults.some((item) => item.requiresConfirmation);

  if (blockedSteps.length) {
    blockedSteps.forEach((item) => reasons.push(...item.reasons));
  }

  return {
    ok: reasons.length === 0,
    blocked: reasons.length > 0,
    reasons,
    code: blockedSteps.find((item) => item.code === 404)?.code || blockedSteps.find((item) => item.code === 428)?.code || 403,
    requiresConfirmation,
    steps: stepResults
  };
}

function assertPlanAllowed(plan = {}, context = {}, options = {}) {
  const result = evaluatePlan(plan, context, options);
  if (result.ok) return result;
  const error = new Error(result.reasons[0] || "Plano bloqueado pela Policy Engine.");
  error.statusCode = result.code || 403;
  error.details = result;
  throw error;
}

module.exports = {
  evaluatePlan,
  assertPlanAllowed
};
