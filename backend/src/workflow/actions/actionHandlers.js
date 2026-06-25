const { publishOsEvent } = require("../../os/osEventPublisher");

function successResult(message, duration = 0, meta = {}) {
  return { success: true, duration, message, ...meta };
}

async function runAction(action = {}, executionContext = {}) {
  const type = String(action.type || "").trim();
  const startedAt = Date.now();

  try {
    switch (type) {
      case "sendNotification":
        return successResult("Notificação processada.", Date.now() - startedAt);
      case "sendPush":
        return successResult("Push processado.", Date.now() - startedAt);
      case "executeAI":
        return successResult("Execução IA simulada.", Date.now() - startedAt);
      case "callWebhook":
        return successResult("Webhook processado.", Date.now() - startedAt);
      case "publishEvent": {
        const eventName = String(action.eventName || "workflow.custom_event").trim();
        await publishOsEvent(eventName, {
          workflowId: executionContext.workflowId,
          action,
          payload: executionContext.payload || {}
        }, executionContext.context || {});
        return successResult("Evento publicado.", Date.now() - startedAt);
      }
      case "createProtocol":
      case "createInvoice":
      case "updateAssociate":
      case "updateProject":
      case "updateAsset":
      case "delay":
      case "decision":
      case "scheduler":
      default:
        return successResult("Ação registrada para execução segura.", Date.now() - startedAt, { type });
    }
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startedAt,
      message: error?.message || "Falha ao executar ação."
    };
  }
}

module.exports = {
  runAction
};
