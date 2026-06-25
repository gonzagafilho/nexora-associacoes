const { startEventTriggers } = require("../triggers/eventTriggers");
const { initWorkflowScheduler } = require("./workflowScheduler");

let initialized = false;

function initWorkflowEngine() {
  if (initialized) return { initialized: true, reused: true };
  startEventTriggers();
  const scheduler = initWorkflowScheduler();
  initialized = true;
  return { initialized: true, scheduler };
}

module.exports = {
  initWorkflowEngine
};
