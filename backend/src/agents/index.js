const registry = require("./agentRegistry");
const supervisor = require("./agentSupervisor");
const metrics = require("./agentMetricsService");
const { registerService } = require("../runtime/runtimeServiceRegistry");
const { subscribeMany } = require("../os/eventBus");

const AGENT_EVENT_MAP = {
  "invoice.paid": ["finance"],
  "invoice.overdue": ["finance"],
  "project.completed": ["projects"],
  "asset.maintenance": ["assets"],
  "protocol.created": ["protocols"],
  "notification.created": ["notifications"],
  "workflow.failed": ["workflow"],
  "subscription.overdue": ["subscription"]
};

let initialized = false;

function registerRuntimeServices() {
  registerService("agents", registry, { type: "agents", status: "online" });
  registerService("agentSupervisor", supervisor, { type: "agents", status: "online" });
  for (const agent of registry.getAllAgents()) {
    registerService(`${agent.id}Agent`, agent, { type: "agent", module: agent.module, status: agent.enabled ? "online" : "disabled" });
  }
}

function registerEventHandlers() {
  subscribeMany(Object.keys(AGENT_EVENT_MAP), async ({ eventName }) => {
    for (const agentId of AGENT_EVENT_MAP[eventName] || []) {
      metrics.recordEventReceived(agentId);
    }
  });
}

function initializeAgents() {
  if (initialized) return { registry, supervisor };
  registerRuntimeServices();
  registerEventHandlers();
  initialized = true;
  return { registry, supervisor };
}

initializeAgents();

module.exports = {
  registry,
  supervisor,
  initializeAgents
};
