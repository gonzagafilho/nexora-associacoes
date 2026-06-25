const { subscribe, publish: eventPublish } = require("../os/eventBus");
const { publishOsEvent } = require("../os/osEventPublisher");
const workflowService = require("../workflow/services/workflowService");
const contextManager = require("./runtimeContext");
const runtimeCache = require("./runtimeCache");
const sessionManager = require("./runtimeSessionManager");
const serviceRegistry = require("./runtimeServiceRegistry");
const driverBridge = require("./runtimeDriverBridge");
const runtimeMetrics = require("./runtimeMetrics");

const RUNTIME_CAPABILITIES = [
  "context",
  "cache",
  "sessions",
  "serviceRegistry",
  "drivers",
  "metrics",
  "kernelBridge",
  "eventBridge",
  "workflowBridge",
  "aiBridge"
];

let bootState = {
  booted: false,
  bootedAt: null
};

function runtimeInfo() {
  return {
    name: "NEXORA Runtime",
    version: "1.0.0",
    status: "online",
    capabilities: [...RUNTIME_CAPABILITIES],
    bootedAt: bootState.bootedAt
  };
}

function bootRuntime() {
  if (!bootState.booted) {
    bootState.booted = true;
    bootState.bootedAt = new Date().toISOString();
  }

  const bridgeServices = [
    ["kernel", { type: "kernel", status: "online", bridge: true }],
    ["eventBus", { type: "eventBus", status: "online", bridge: true }],
    ["workflow", { type: "workflow", status: "online", bridge: true }],
    ["ai", { type: "ai", status: "online", bridge: true }],
    ["bi", { type: "bi", status: "online", bridge: true }],
    ["notifications", { type: "notifications", status: "online", bridge: true }],
    ["push", { type: "push", status: "online", bridge: true }],
    ["financial", { type: "financial", status: "online", bridge: true }],
    ["projects", { type: "projects", status: "online", bridge: true }],
    ["assets", { type: "assets", status: "online", bridge: true }],
    ["protocols", { type: "protocols", status: "online", bridge: true }],
    ["invoices", { type: "invoices", status: "online", bridge: true }],
    ["associates", { type: "associates", status: "online", bridge: true }]
  ];

  for (const [name, metadata] of bridgeServices) {
    serviceRegistry.registerService(name, null, metadata);
  }
  runtimeMetrics.increment("servicesRegistered", bridgeServices.length);
  return runtimeInfo();
}

function getRuntimeInfo() {
  return runtimeInfo();
}

function getRuntimeStatus() {
  return {
    name: "NEXORA Runtime",
    status: bootState.booted ? "online" : "booting",
    bootedAt: bootState.bootedAt
  };
}

function getRuntimeCapabilities() {
  return [...RUNTIME_CAPABILITIES];
}

function getRuntimeMetrics(extra = {}) {
  return runtimeMetrics.snapshot(extra);
}

function getService(name) {
  return serviceRegistry.getService(name);
}

function registerService(name, service, metadata = {}) {
  const registered = serviceRegistry.registerService(name, service, metadata);
  runtimeMetrics.increment("servicesRegistered", 1);
  return registered;
}

async function publish(eventName, payload = {}, context = {}) {
  runtimeMetrics.increment("eventsPublished", 1);

  if (context && (context.tenantId || context.userId || context.module || context.action)) {
    return publishOsEvent(
      eventName,
      {
        tenantId: context.tenantId,
        userId: context.userId,
        module: context.module || "runtime",
        action: context.action || "publish",
        payload
      },
      context
    );
  }

  return eventPublish(eventName, payload, context);
}

function workflowDashboard(context = {}) {
  const tenantId = context?.tenantId;
  if (!tenantId) {
    return Promise.resolve({ totalWorkflows: 0, statuses: [], recentExecutions: [] });
  }
  return workflowService.getWorkflowDashboard(tenantId);
}

function listServices() {
  return serviceRegistry.listServices();
}

module.exports = {
  bootRuntime,
  getRuntimeInfo,
  getRuntimeStatus,
  getRuntimeCapabilities,
  getRuntimeMetrics,
  getService,
  registerService,
  publish,
  subscribe,
  context: () => contextManager,
  cache: () => runtimeCache,
  sessions: () => sessionManager,
  drivers: () => driverBridge,
  listServices,
  workflowDashboard
};
