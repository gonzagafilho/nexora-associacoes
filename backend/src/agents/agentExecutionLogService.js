const AgentExecutionLog = require("../models/AgentExecutionLog");

function sanitizeInput(input) {
  return String(input || "").slice(0, 2000);
}

function sanitizeOutput(output) {
  if (!output || typeof output !== "object") return {};
  const { token, accessToken, refreshToken, secret, password, ...safe } = output;
  return safe;
}

async function createExecutionLog({ tenantId, userId, agentId, input, output, status, latencyMs, error }) {
  if (!tenantId || !agentId) return null;
  return AgentExecutionLog.create({
    tenantId,
    userId,
    agentId,
    input: sanitizeInput(input),
    output: sanitizeOutput(output),
    status,
    latencyMs: Number(latencyMs || 0),
    error: error ? String(error).slice(0, 1000) : ""
  });
}

async function listExecutionLogs({ tenantId, agentId, status, limit = 50 }) {
  const filter = { tenantId };
  if (agentId) filter.agentId = agentId;
  if (status) filter.status = status;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return AgentExecutionLog.find(filter).sort({ createdAt: -1 }).limit(safeLimit).lean();
}

module.exports = {
  createExecutionLog,
  listExecutionLogs
};
