const { registry } = require("../skills/registry");

async function executePlan(plan = {}, context = {}, options = {}) {
  const startedAt = Date.now();
  const results = [];

  for (const step of plan.steps || []) {
    const stepStartedAt = Date.now();
    step.status = "running";
    step.startedAt = new Date().toISOString();

    try {
      const execution = await registry.execute(step.skill, step.payload || {}, context);
      step.status = "success";
      step.result = execution;
      step.errorMessage = "";
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.now() - stepStartedAt;
      results.push({ skill: step.skill, ok: true, result: execution, durationMs: step.durationMs });

      if (typeof options.onStepFinished === "function") {
        await options.onStepFinished(step, { ok: true, result: execution, durationMs: step.durationMs });
      }
    } catch (error) {
      step.status = "error";
      step.result = null;
      step.errorMessage = error.message || "Erro na execução da skill.";
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.now() - stepStartedAt;
      results.push({ skill: step.skill, ok: false, errorMessage: step.errorMessage, durationMs: step.durationMs });

      if (typeof options.onStepFinished === "function") {
        await options.onStepFinished(step, { ok: false, errorMessage: step.errorMessage, durationMs: step.durationMs });
      }

      return {
        ok: false,
        success: false,
        status: "error",
        errorMessage: step.errorMessage,
        failedStep: step.skill,
        executedSteps: results.filter((item) => item.ok).length,
        totalSteps: Array.isArray(plan.steps) ? plan.steps.length : 0,
        totalDurationMs: Date.now() - startedAt,
        steps: results
      };
    }
  }

  return {
    ok: true,
    success: true,
    status: "success",
    errorMessage: "",
    failedStep: "",
    executedSteps: results.length,
    totalSteps: Array.isArray(plan.steps) ? plan.steps.length : 0,
    totalDurationMs: Date.now() - startedAt,
    steps: results
  };
}

module.exports = {
  executePlan
};
