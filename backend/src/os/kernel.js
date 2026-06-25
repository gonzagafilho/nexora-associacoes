const { listDrivers } = require("./driverRegistry");
const { RESERVED_EVENTS } = require("./eventBus");

const ENGINE_NAMES = [
  "eventBus",
  "workflowEngine",
  "automationEngine",
  "permissionEngine",
  "auditEngine",
  "notificationEngine",
  "scheduler",
  "driverRegistry"
];

let bootState = {
  booted: false,
  bootedAt: null
};

function getKernelInfo() {
  return {
    name: "NEXORA OS Kernel",
    version: "1.0.0",
    status: "online",
    engines: [...ENGINE_NAMES],
    bootedAt: bootState.bootedAt
  };
}

function getRegisteredEngines() {
  return [...ENGINE_NAMES];
}

function getKernelCapabilities() {
  const drivers = listDrivers();
  return {
    events: true,
    workflows: true,
    automations: true,
    permissions: true,
    audit: true,
    notifications: true,
    scheduler: true,
    drivers: true,
    reservedEvents: RESERVED_EVENTS.length,
    registeredDriverTypes: Object.keys(drivers).length
  };
}

function bootKernel() {
  if (!bootState.booted) {
    bootState = {
      booted: true,
      bootedAt: new Date().toISOString()
    };
  }
  return getKernelInfo();
}

module.exports = {
  getKernelInfo,
  getKernelCapabilities,
  getRegisteredEngines,
  bootKernel
};
