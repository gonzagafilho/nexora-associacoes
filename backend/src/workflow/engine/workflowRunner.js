const WorkflowExecution = require("../models/WorkflowExecution");
const WorkflowLog = require("../models/WorkflowLog");
const { runAction } = require("../actions/actionHandlers");
const { publishOsEvent } = require("../../os/osEventPublisher");

async function executeWorkflow(workflow, payload = {}, context = {}) {
  const startedAt = new Date();
  const execution = await WorkflowExecution.create({
    workflowId: workflow._id,
    tenantId: workflow.tenantId,
    startedAt,
    status: "running",
    event: {
      trigger: workflow?.trigger?.eventName || workflow?.trigger?.type,
      payload
    }
  });

  await publishOsEvent("workflow.started", {
    workflowId: workflow._id,
    workflowName: workflow.name,
    executionId: execution._id,
    trigger: workflow?.trigger || {},
    payload
  }, context);

  const actionLogs = [];

  try {
    for (const action of workflow.actions || []) {
      const actionStart = Date.now();
      const result = await runAction(action, {
        workflowId: workflow._id,
        executionId: execution._id,
        payload,
        context
      });

      const logEntry = {
        executionId: execution._id,
        workflowId: workflow._id,
        action: String(action.type || "unknown"),
        success: Boolean(result.success),
        startedAt: new Date(actionStart),
        finishedAt: new Date(),
        duration: Number(result.duration || Date.now() - actionStart),
        payload: { action, result },
        error: result.success ? "" : String(result.message || "Erro na ação")
      };
      await WorkflowLog.create(logEntry);
      actionLogs.push(logEntry);

      await publishOsEvent("workflow.action", {
        workflowId: workflow._id,
        executionId: execution._id,
        action: action.type,
        success: result.success,
        message: result.message
      }, context);

      if (!result.success) {
        throw new Error(result.message || "Falha em ação do workflow.");
      }
    }

    const finishedAt = new Date();
    const duration = finishedAt.getTime() - startedAt.getTime();
    await WorkflowExecution.findByIdAndUpdate(execution._id, {
      $set: {
        finishedAt,
        duration,
        status: "completed",
        logs: actionLogs
      }
    });

    await publishOsEvent("workflow.completed", {
      workflowId: workflow._id,
      workflowName: workflow.name,
      executionId: execution._id,
      duration
    }, context);

    return { success: true, executionId: execution._id, duration };
  } catch (error) {
    const finishedAt = new Date();
    const duration = finishedAt.getTime() - startedAt.getTime();
    await WorkflowExecution.findByIdAndUpdate(execution._id, {
      $set: {
        finishedAt,
        duration,
        status: "failed",
        logs: actionLogs,
        error: error?.message || "Falha na execução do workflow."
      }
    });

    await publishOsEvent("workflow.failed", {
      workflowId: workflow._id,
      workflowName: workflow.name,
      executionId: execution._id,
      duration,
      error: error?.message || "Falha na execução do workflow."
    }, context);

    return {
      success: false,
      executionId: execution._id,
      duration,
      error: error?.message || "Falha na execução do workflow."
    };
  }
}

module.exports = {
  executeWorkflow
};
