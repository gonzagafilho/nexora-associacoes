const { getKernelInfo } = require("./kernel");
const { getEventStats } = require("./eventBus");
const { listWorkflows } = require("./workflowEngine");
const { listAutomations } = require("./automationEngine");
const { getAuditStats } = require("./auditEngine");
const { getNotificationEngineStatus } = require("./notificationEngine");
const { listJobs } = require("./scheduler");
const { listDrivers } = require("./driverRegistry");

function getOsHealth() {
  const drivers = listDrivers();

  return {
    kernel: {
      status: getKernelInfo().status,
      version: getKernelInfo().version,
      name: getKernelInfo().name
    },
    eventBus: {
      status: "online",
      ...getEventStats()
    },
    workflowEngine: {
      status: "online",
      total: listWorkflows().length
    },
    automationEngine: {
      status: "online",
      total: listAutomations().length
    },
    permissionEngine: {
      status: "online",
      mode: "role-module"
    },
    auditEngine: {
      status: "online",
      ...getAuditStats()
    },
    notificationEngine: {
      status: "online",
      ...getNotificationEngineStatus()
    },
    scheduler: {
      status: "online",
      jobs: listJobs().length
    },
    driverRegistry: {
      status: "online",
      types: Object.keys(drivers).length,
      drivers
    }
  };
}

module.exports = {
  getOsHealth
};
