const aiActivityLogService = require("../../../modules/ai/aiActivityLog.service");

async function log(data = {}) {
  try {
    await aiActivityLogService.createActivityLog({
      tenantId: data.tenantId,
      userId: data.userId,
      projectKey: data.projectKey || "associacoes",
      module: data.module || "NEXORA Platform",
      action: data.action || "platform.audit",
      question: data.question || "",
      answer: data.answer || "",
      memoryIds: [],
      memoryCount: 0,
      memoryContextPreview: "",
      status: data.status || "success",
      errorMessage: data.errorMessage || "",
      durationMs: Number(data.durationMs || 0),
      metadata: data.metadata || {}
    });
  } catch (_error) {
    // never break primary flow
  }
}

module.exports = {
  log
};
