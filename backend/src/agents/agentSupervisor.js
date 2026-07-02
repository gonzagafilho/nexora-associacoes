const Tenant = require("../models/Tenant");
const registry = require("./agentRegistry");
const metrics = require("./agentMetricsService");
const { createExecutionLog } = require("./agentExecutionLogService");

const BROAD_TERMS = ["como esta minha empresa", "resumo executivo", "visao executiva", "saude da empresa", "indicadores gerais"];
const BROAD_AGENT_IDS = ["finance", "projects", "assets", "protocols", "bi", "notifications"];
const MODULE_ALIASES = {
  finance: "financial",
  projects: "projects",
  assets: "assets",
  protocols: "protocols",
  workflow: "workflow",
  bi: "core",
  notifications: "core",
  subscription: "core",
  scheduler: "core"
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?!.:,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function tenantModules(tenantId) {
  try {
    const tenant = await Tenant.findById(tenantId).select("enabledModules").lean();
    return Array.isArray(tenant?.enabledModules) ? tenant.enabledModules.map((item) => normalize(item).replace(/[^a-z0-9]/g, "")) : [];
  } catch (_error) {
    return [];
  }
}

function agentAllowed(agent, enabledModules = []) {
  if (!agent?.enabled) return false;
  const moduleCode = MODULE_ALIASES[agent.id] || agent.module || "core";
  if (["core", "bi", "notifications", "scheduler"].includes(moduleCode)) return true;
  if (!enabledModules.length) return true;
  return enabledModules.includes(normalize(moduleCode).replace(/[^a-z0-9]/g, ""));
}

async function analyze(input, context = {}) {
  const text = normalize(input);
  const broad = BROAD_TERMS.some((term) => text.includes(term));
  const enabledModules = await tenantModules(context.tenantId);
  const bestAgent = broad ? null : registry.findBestAgent(input, context);
  return { broad, enabledModules, bestAgentId: bestAgent?.id || null };
}

async function route(input, context = {}) {
  const analysis = await analyze(input, context);
  if (analysis.broad) {
    return BROAD_AGENT_IDS
      .map((id) => registry.getAgent(id))
      .filter((agent) => agentAllowed(agent, analysis.enabledModules));
  }
  const best = registry.getAgent(analysis.bestAgentId);
  if (agentAllowed(best, analysis.enabledModules)) return [best];
  const fallback = registry.getAgent("bi");
  return fallback ? [fallback] : [];
}

async function runAgent(agent, input, context = {}) {
  const startedAt = Date.now();
  try {
    const output = await agent.execute(input, context);
    const latencyMs = Date.now() - startedAt;
    metrics.recordExecution(agent.id, { ok: true, latencyMs });
    await createExecutionLog({ tenantId: context.tenantId, userId: context.userId, agentId: agent.id, input, output, status: "success", latencyMs });
    return { agentId: agent.id, ok: true, latencyMs, ...output };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const output = { ok: false, answer: `${agent.name} não conseguiu concluir a análise.`, error: error.message };
    metrics.recordExecution(agent.id, { ok: false, latencyMs });
    await createExecutionLog({ tenantId: context.tenantId, userId: context.userId, agentId: agent.id, input, output, status: "failed", latencyMs, error: error.message });
    return { agentId: agent.id, ok: false, latencyMs, answer: output.answer, error: error.message };
  }
}

async function execute(input, context = {}) {
  const agents = await route(input, context);
  if (!agents.length) {
    return {
      ok: true,
      supervisor: true,
      agentsUsed: [],
      answer: "Nenhum agente ativo encontrou uma rota segura para esta pergunta.",
      results: []
    };
  }
  const results = [];
  for (const agent of agents) {
    results.push(await runAgent(agent, input, context));
  }
  return summarize(results, context);
}

async function executeMany(agentIds, input, context = {}) {
  const enabledModules = await tenantModules(context.tenantId);
  const agents = (agentIds || []).map((id) => registry.getAgent(id)).filter((agent) => agentAllowed(agent, enabledModules));
  const results = [];
  for (const agent of agents) {
    results.push(await runAgent(agent, input, context));
  }
  return summarize(results, context);
}

function summarize(results, _context = {}) {
  const successful = results.filter((result) => result.ok !== false);
  const failed = results.filter((result) => result.ok === false);
  const answer = successful.map((result) => result.answer).filter(Boolean).join(" ");
  return {
    ok: true,
    supervisor: true,
    agentsUsed: results.map((result) => result.agentId),
    answer: answer || "Os agentes não retornaram dados suficientes para consolidar uma resposta.",
    data: Object.fromEntries(results.map((result) => [result.agentId, result.data || {}])),
    results,
    failures: failed.map((result) => ({ agentId: result.agentId, error: result.error }))
  };
}

module.exports = {
  analyze,
  route,
  execute,
  executeMany,
  summarize,
  _private: { normalize, agentAllowed, tenantModules, runAgent }
};
