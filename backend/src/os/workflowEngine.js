const workflows = new Map();

function normalizeDefinition(definition = {}) {
  return {
    id: String(definition.id || "").trim(),
    name: String(definition.name || "").trim(),
    trigger: String(definition.trigger || "").trim(),
    enabled: definition.enabled !== false,
    steps: Array.isArray(definition.steps) ? definition.steps : []
  };
}

function registerWorkflow(definition) {
  const normalized = normalizeDefinition(definition);
  if (!normalized.id || !normalized.name || !normalized.trigger) {
    throw new Error("workflowEngine.registerWorkflow requer id, name e trigger.");
  }
  workflows.set(normalized.id, normalized);
  return { ...normalized };
}

function listWorkflows() {
  return [...workflows.values()].map((item) => ({ ...item, steps: [...item.steps] }));
}

function runWorkflow(trigger, payload = {}, context = {}) {
  const triggerKey = String(trigger || "").trim();
  const matched = listWorkflows().filter((workflow) => workflow.enabled && workflow.trigger === triggerKey);

  const executions = matched.map((workflow) => ({
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "simulated",
    steps: workflow.steps.map((step, index) => ({
      step: index + 1,
      action: step,
      status: "simulated"
    }))
  }));

  return {
    trigger: triggerKey,
    simulated: true,
    payload,
    context,
    matched: executions.length,
    executions
  };
}

module.exports = {
  registerWorkflow,
  listWorkflows,
  runWorkflow
};
