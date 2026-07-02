const { createPlan } = require("./planner");
const { buildContext } = require("./contextBuilder");
const { assertPlanAllowed, evaluatePlan } = require("./policyEngine");
const { executePlan } = require("./executor");
const logger = require("./orchestratorLogger");

const plansByTenant = new Map();

function normalizeProjectKey(value) {
  return String(value || "associacoes").trim().toLowerCase() || "associacoes";
}

function tenantPlans(tenantId) {
  const key = String(tenantId || "");
  if (!plansByTenant.has(key)) plansByTenant.set(key, new Map());
  return plansByTenant.get(key);
}

function savePlan(plan) {
  tenantPlans(plan.tenantId).set(plan.id, plan);
  return plan;
}

function getPlan({ tenantId, id }) {
  return tenantPlans(tenantId).get(String(id || "")) || null;
}

function listPlans({ tenantId, query = {} }) {
  const plans = Array.from(tenantPlans(tenantId).values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const status = String(query.status || "").trim();
  const projectKey = String(query.projectKey || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);

  return plans
    .filter((plan) => (!status || plan.status === status) && (!projectKey || plan.projectKey === projectKey))
    .slice(0, limit);
}

function statusSummary({ tenantId }) {
  const plans = Array.from(tenantPlans(tenantId).values());
  const executed = plans.filter((item) => ["success", "error"].includes(item.status));
  const successful = executed.filter((item) => item.success).length;
  const failed = executed.filter((item) => !item.success).length;
  const avgDurationMs = executed.length
    ? Math.round(executed.reduce((sum, item) => sum + Number(item.totalDurationMs || 0), 0) / executed.length)
    : 0;

  return {
    totalPlans: plans.length,
    planned: plans.filter((item) => item.status === "planned").length,
    running: plans.filter((item) => item.status === "running").length,
    executed: executed.length,
    successful,
    failed,
    avgDurationMs,
    recent: plans.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 20)
  };
}

async function plan({ tenantId, userId, userRole, userEmail, enabledModules, question, projectKey, input = {} }) {
  const startedAt = Date.now();
  const normalizedProjectKey = normalizeProjectKey(projectKey || input.projectKey);
  const context = await buildContext({ tenantId, userId, projectKey: normalizedProjectKey, question, context: { userRole, userEmail, enabledModules } });

  const planData = createPlan({
    tenantId,
    userId,
    projectKey: normalizedProjectKey,
    question,
    intent: input.intent,
    associateId: input.associateId,
    amount: input.amount,
    dueDate: input.dueDate,
    description: input.description,
    protocolTitle: input.protocolTitle,
    protocolDescription: input.protocolDescription,
    whatsapp: input.whatsapp,
    notificationMessage: input.notificationMessage,
    workflowKey: input.workflowKey,
    userEmail,
    steps: input.steps
  });

  const policy = evaluatePlan(planData, { tenantId, userId, userRole, userEmail, enabledModules }, { phase: "planning", confirmed: false });
  planData.metadata = {
    ...(planData.metadata || {}),
    policy: {
      ok: policy.ok,
      blocked: policy.blocked,
      reasons: policy.reasons,
      requiresConfirmation: policy.requiresConfirmation
    },
    contextSummary: {
      projectMemoryCount: Number(context.memories?.projectMemory?.length || 0),
      tenantMemoryCount: Number(context.memories?.tenantMemory?.length || 0),
      userMemoryCount: Number(context.memories?.userMemory?.length || 0),
      availableSkills: Number(context.availableSkills?.length || 0),
      activityLogs: Number(context.activity?.recentLogs?.length || 0)
    }
  };

  savePlan(planData);

  await logger.logPlanCreated({
    tenantId,
    userId,
    projectKey: normalizedProjectKey,
    question,
    plan: planData,
    durationMs: Date.now() - startedAt
  });

  return {
    ok: true,
    plan: planData,
    context,
    policy
  };
}

async function execute({ tenantId, userId, userRole, userEmail, enabledModules, planId, confirm = false }) {
  const planData = getPlan({ tenantId, id: planId });
  if (!planData) {
    const error = new Error("Plano não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const policy = assertPlanAllowed(planData, { tenantId, userId, userRole, userEmail, enabledModules }, { phase: "execution", confirmed: Boolean(confirm) });

  planData.status = "running";
  planData.updatedAt = new Date().toISOString();

  const execution = await executePlan(planData, { tenantId, userId, userRole, userEmail, enabledModules }, {
    async onStepFinished(step) {
      await logger.logStepExecution({
        tenantId,
        userId,
        projectKey: planData.projectKey,
        planId: planData.id,
        step,
        status: step.status === "success" ? "success" : "error",
        errorMessage: step.errorMessage || "",
        durationMs: Number(step.durationMs || 0)
      });
    }
  });

  planData.totalDurationMs = Number(execution.totalDurationMs || 0);
  planData.success = Boolean(execution.success);
  planData.status = execution.success ? "success" : "error";
  planData.errorMessage = execution.errorMessage || "";
  planData.updatedAt = new Date().toISOString();
  planData.metadata = {
    ...(planData.metadata || {}),
    policy: {
      ok: policy.ok,
      blocked: policy.blocked,
      reasons: policy.reasons,
      requiresConfirmation: policy.requiresConfirmation
    }
  };

  savePlan(planData);

  await logger.logPlanExecuted({
    tenantId,
    userId,
    projectKey: planData.projectKey,
    plan: planData,
    execution
  });

  return {
    ok: true,
    plan: planData,
    execution
  };
}

module.exports = {
  plan,
  execute,
  getPlan,
  listPlans,
  statusSummary
};
