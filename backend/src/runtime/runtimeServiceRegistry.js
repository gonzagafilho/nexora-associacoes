const services = new Map();

const PLACEHOLDER_NAMES = [
  "kernel",
  "eventBus",
  "workflow",
  "ai",
  "bi",
  "notifications",
  "push",
  "financial",
  "projects",
  "assets",
  "protocols",
  "invoices",
  "associates"
];

function registerService(name, service, metadata = {}) {
  const serviceName = String(name || "").trim();
  if (!serviceName) {
    throw new Error("runtimeServiceRegistry.registerService requer name válido.");
  }
  const next = {
    name: serviceName,
    service: service || null,
    metadata: {
      type: metadata.type || "service",
      status: metadata.status || "online",
      bridge: Boolean(metadata.bridge),
      placeholder: Boolean(metadata.placeholder),
      registeredAt: metadata.registeredAt || new Date().toISOString(),
      ...metadata
    }
  };
  services.set(serviceName, next);
  return next;
}

function getService(name) {
  const serviceName = String(name || "").trim();
  if (!serviceName || !services.has(serviceName)) return null;
  return services.get(serviceName).service;
}

function listServices() {
  return [...services.values()].map((entry) => ({
    name: entry.name,
    metadata: { ...entry.metadata }
  }));
}

function hasService(name) {
  const serviceName = String(name || "").trim();
  return Boolean(serviceName && services.has(serviceName));
}

function registerPlaceholders() {
  for (const name of PLACEHOLDER_NAMES) {
    if (services.has(name)) continue;
    registerService(name, null, {
      type: "bridge",
      status: "placeholder",
      placeholder: true,
      bridge: true
    });
  }
}

registerPlaceholders();

module.exports = {
  registerService,
  getService,
  listServices,
  hasService
};
