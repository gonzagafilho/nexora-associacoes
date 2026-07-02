const FinanceAgent = require("./financeAgent");
const ProjectsAgent = require("./projectsAgent");
const AssetsAgent = require("./assetsAgent");
const ProtocolAgent = require("./protocolAgent");
const WorkflowAgent = require("./workflowAgent");
const BiAgent = require("./biAgent");
const NotificationAgent = require("./notificationAgent");
const SubscriptionAgent = require("./subscriptionAgent");
const SchedulerAgent = require("./schedulerAgent");
const { getMetrics } = require("./agentMetricsService");

const agents = new Map();

function register(agent) {
  if (!agent?.id) throw new Error("agentRegistry.register requer agente com id.");
  agents.set(agent.id, agent);
  return agent;
}

function unregister(agentId) {
  return agents.delete(agentId);
}

function getAgent(agentId) {
  return agents.get(agentId) || null;
}

function getAllAgents() {
  return [...agents.values()];
}

function findByCapability(capability) {
  const normalized = String(capability || "").toLowerCase();
  return getAllAgents().filter((agent) => agent.capabilities.some((item) => String(item).toLowerCase().includes(normalized)));
}

function findBestAgent(input, context = {}) {
  const candidates = getAllAgents().filter((agent) => agent.canHandle(input, context));
  if (!candidates.length) return null;
  const text = String(input || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return candidates
    .map((agent) => ({
      agent,
      score: agent.capabilities.reduce((sum, capability) => sum + (text.includes(String(capability).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score)[0].agent;
}

function getAgentStatus() {
  return getAllAgents().map((agent) => ({
    ...agent.getStatus(),
    metrics: getMetrics(agent.id)
  }));
}

function registerDefaultAgents() {
  agents.clear();
  [
    new FinanceAgent(),
    new ProjectsAgent(),
    new AssetsAgent(),
    new ProtocolAgent(),
    new WorkflowAgent(),
    new BiAgent(),
    new NotificationAgent(),
    new SubscriptionAgent(),
    new SchedulerAgent()
  ].forEach(register);
  return getAllAgents();
}

registerDefaultAgents();

module.exports = {
  register,
  unregister,
  getAgent,
  getAllAgents,
  findByCapability,
  findBestAgent,
  getAgentStatus,
  registerDefaultAgents
};
