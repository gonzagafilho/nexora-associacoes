const mongoose = require("mongoose");
const Workflow = require("../models/Workflow");
const WorkflowExecution = require("../models/WorkflowExecution");
const { validateWorkflowDefinition } = require("../engine/workflowValidator");
const { compileWorkflow } = require("../engine/workflowCompiler");
const { executeWorkflow } = require("../engine/workflowRunner");

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function requireTenantObjectId(tenantId) {
  const objectId = toObjectId(tenantId);
  if (!objectId) {
    const error = new Error("tenantId inválido.");
    error.status = 400;
    throw error;
  }
  return objectId;
}

async function listWorkflows(tenantId) {
  return Workflow.find({ tenantId: requireTenantObjectId(tenantId) }).sort({ createdAt: -1 }).lean();
}

async function getWorkflowById(tenantId, workflowId) {
  return Workflow.findOne({ _id: workflowId, tenantId: requireTenantObjectId(tenantId) });
}

async function createWorkflow(tenantId, payload, userId) {
  const validation = validateWorkflowDefinition(payload);
  if (!validation.valid) {
    const error = new Error("Workflow inválido.");
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }
  const created = await Workflow.create({
    tenantId: requireTenantObjectId(tenantId),
    name: String(payload.name || "").trim(),
    description: String(payload.description || "").trim(),
    enabled: payload.enabled !== false,
    trigger: payload.trigger || {},
    conditions: Array.isArray(payload.conditions) ? payload.conditions : [],
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    createdBy: toObjectId(userId),
    updatedBy: toObjectId(userId)
  });
  return created;
}

async function updateWorkflow(tenantId, workflowId, payload, userId) {
  const existing = await getWorkflowById(tenantId, workflowId);
  if (!existing) {
    const error = new Error("Workflow não encontrado.");
    error.status = 404;
    throw error;
  }
  const merged = {
    name: payload.name ?? existing.name,
    description: payload.description ?? existing.description,
    enabled: payload.enabled ?? existing.enabled,
    trigger: payload.trigger ?? existing.trigger,
    conditions: payload.conditions ?? existing.conditions,
    actions: payload.actions ?? existing.actions
  };
  const validation = validateWorkflowDefinition(merged);
  if (!validation.valid) {
    const error = new Error("Workflow inválido.");
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }
  existing.name = String(merged.name || "").trim();
  existing.description = String(merged.description || "").trim();
  existing.enabled = merged.enabled !== false;
  existing.trigger = merged.trigger || {};
  existing.conditions = Array.isArray(merged.conditions) ? merged.conditions : [];
  existing.actions = Array.isArray(merged.actions) ? merged.actions : [];
  existing.updatedBy = toObjectId(userId);
  await existing.save();
  return existing;
}

async function deleteWorkflow(tenantId, workflowId) {
  const deleted = await Workflow.findOneAndDelete({ _id: workflowId, tenantId: requireTenantObjectId(tenantId) });
  return Boolean(deleted);
}

async function setWorkflowEnabled(tenantId, workflowId, enabled, userId) {
  const workflow = await getWorkflowById(tenantId, workflowId);
  if (!workflow) {
    const error = new Error("Workflow não encontrado.");
    error.status = 404;
    throw error;
  }
  workflow.enabled = Boolean(enabled);
  workflow.updatedBy = toObjectId(userId);
  await workflow.save();
  return workflow;
}

async function runWorkflowNow(tenantId, workflowId, payload = {}, context = {}) {
  const workflow = await getWorkflowById(tenantId, workflowId);
  if (!workflow) {
    const error = new Error("Workflow não encontrado.");
    error.status = 404;
    throw error;
  }
  const compiled = compileWorkflow(workflow);
  return executeWorkflow(compiled, payload, context);
}

async function getWorkflowDashboard(tenantId) {
  const tenantObjectId = requireTenantObjectId(tenantId);
  const [summary, statuses, recent] = await Promise.all([
    Workflow.countDocuments({ tenantId: tenantObjectId }),
    WorkflowExecution.aggregate([
      { $match: { tenantId: tenantObjectId } },
      { $group: { _id: "$status", total: { $sum: 1 } } }
    ]),
    WorkflowExecution.find({ tenantId: tenantObjectId }).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  return {
    totalWorkflows: summary,
    statuses,
    recentExecutions: recent
  };
}

async function listExecutions(tenantId, limit = 30) {
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  return WorkflowExecution.find({ tenantId: requireTenantObjectId(tenantId) }).sort({ createdAt: -1 }).limit(normalizedLimit).lean();
}

async function findEnabledByEvent(tenantId, eventName) {
  return Workflow.find({
    tenantId: requireTenantObjectId(tenantId),
    enabled: true,
    "trigger.type": "event",
    "trigger.eventName": String(eventName || "")
  });
}

module.exports = {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  setWorkflowEnabled,
  runWorkflowNow,
  getWorkflowDashboard,
  listExecutions,
  findEnabledByEvent
};
