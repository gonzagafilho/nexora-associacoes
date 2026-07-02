const aiActivityLogService = require("../aiActivityLog.service");

function normalizeAnswer(value) {
  try {
    return JSON.stringify(value || {}).slice(0, 6000);
  } catch (_error) {
    return String(value || "").slice(0, 6000);
  }
}

async function writeLogSafe(data = {}) {
  try {
    await aiActivityLogService.createActivityLog(data);
  } catch (_error) {
    // never break orchestrator flow due to logging
  }
}

async function logPlanCreated({ tenantId, userId, projectKey, question, plan, durationMs = 0 }) {
  await writeLogSafe({
    tenantId,
    userId,
    projectKey,
    module: "NEXORA Orchestrator",
    action: "orchestrator.plan.created",
    question: String(question || "").slice(0, 6000),
    answer: normalizeAnswer({ planId: plan?.id, intent: plan?.intent, steps: plan?.steps?.map((step) => step.skill) || [] }),
    memoryIds: [],
    memoryCount: 0,
    memoryContextPreview: "",
    status: "success",
    errorMessage: "",
    durationMs,
    metadata: {
      planId: plan?.id,
      intent: plan?.intent,
      stepCount: Array.isArray(plan?.steps) ? plan.steps.length : 0
    }
  });
}

async function logStepExecution({ tenantId, userId, projectKey, planId, step, status = "success", errorMessage = "", durationMs = 0 }) {
  await writeLogSafe({
    tenantId,
    userId,
    projectKey,
    module: "NEXORA Orchestrator",
    action: "orchestrator.skill.executed",
    question: step?.skill || "",
    answer: normalizeAnswer(step?.result || {}),
    memoryIds: [],
    memoryCount: 0,
    memoryContextPreview: "",
    status,
    errorMessage,
    durationMs,
    metadata: {
      planId,
      skill: step?.skill || "",
      stepStatus: step?.status || "pending"
    }
  });
}

async function logPlanExecuted({ tenantId, userId, projectKey, plan, execution }) {
  await writeLogSafe({
    tenantId,
    userId,
    projectKey,
    module: "NEXORA Orchestrator",
    action: "orchestrator.plan.executed",
    question: plan?.question || "",
    answer: normalizeAnswer({
      planId: plan?.id,
      success: execution?.success,
      executedSteps: execution?.executedSteps,
      failedStep: execution?.failedStep || null
    }),
    memoryIds: [],
    memoryCount: 0,
    memoryContextPreview: "",
    status: execution?.success ? "success" : "error",
    errorMessage: execution?.errorMessage || "",
    durationMs: Number(execution?.totalDurationMs || 0),
    metadata: {
      planId: plan?.id,
      intent: plan?.intent,
      stepCount: Array.isArray(plan?.steps) ? plan.steps.length : 0,
      executedSteps: Number(execution?.executedSteps || 0)
    }
  });
}

module.exports = {
  logPlanCreated,
  logPlanExecuted,
  logStepExecution
};
