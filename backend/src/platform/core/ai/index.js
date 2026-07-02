const orchestrator = require("../orchestrator");
const skills = require("../skills");
const { registry } = require("../../appRegistry");

function resolveAppFromProject(projectKey = "") {
  const value = String(projectKey || "").trim().toLowerCase();
  if (!value) return "associacoes";
  if (registry.get(value)) return value;
  return "associacoes";
}

async function planAndMaybeExecute({ question, projectKey, appId, context, autoExecute = false, confirm = false, input = {} }) {
  const resolvedAppId = appId || resolveAppFromProject(projectKey);
  const planResult = await orchestrator.plan({
    tenantId: context.tenantId,
    userId: context.userId,
    userRole: context.userRole,
    userEmail: context.userEmail,
    enabledModules: context.enabledModules,
    question,
    projectKey,
    input: {
      ...input,
      appId: resolvedAppId,
      projectKey
    }
  });

  if (!autoExecute) {
    return {
      appId: resolvedAppId,
      planResult,
      executionResult: null
    };
  }

  const executionResult = await orchestrator.execute({
    tenantId: context.tenantId,
    userId: context.userId,
    userRole: context.userRole,
    userEmail: context.userEmail,
    enabledModules: context.enabledModules,
    planId: planResult.plan.id,
    confirm
  });

  return {
    appId: resolvedAppId,
    planResult,
    executionResult
  };
}

function executeSkill(skillAction, payload = {}, context = {}) {
  return skills.execute(skillAction, payload, context);
}

module.exports = {
  resolveAppFromProject,
  planAndMaybeExecute,
  executeSkill
};
