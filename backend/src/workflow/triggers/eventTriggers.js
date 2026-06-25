const { subscribeMany } = require("../../os/eventBus");
const workflowService = require("../services/workflowService");
const { executeWorkflow } = require("../engine/workflowRunner");

const TRIGGER_EVENT_MAP = {
  invoicePaid: "invoice.paid",
  invoiceOverdue: "invoice.overdue",
  associateCreated: "associate.created",
  protocolClosed: "protocol.closed",
  assetSold: "asset.sold",
  scheduler: "workflow.scheduler"
};

const DEFAULT_EVENTS = Object.values(TRIGGER_EVENT_MAP);
let unsubscribeHandlers = [];

async function processEvent(event) {
  const tenantId = event?.context?.tenantId || event?.payload?.tenantId;
  if (!tenantId) return;

  const workflows = await workflowService.findEnabledByEvent(tenantId, event.eventName);
  for (const workflow of workflows) {
    await executeWorkflow(workflow, event.payload || {}, event.context || {});
  }
}

function startEventTriggers() {
  if (unsubscribeHandlers.length) return;
  unsubscribeHandlers = subscribeMany(DEFAULT_EVENTS, async (event) => {
    try {
      await processEvent(event);
    } catch (_error) {
      // Fail-safe: workflow trigger processing cannot break event bus flow.
    }
  });
}

function stopEventTriggers() {
  unsubscribeHandlers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (_error) {
      // No-op.
    }
  });
  unsubscribeHandlers = [];
}

module.exports = {
  TRIGGER_EVENT_MAP,
  startEventTriggers,
  stopEventTriggers
};
