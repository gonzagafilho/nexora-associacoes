function compileWorkflow(workflow) {
  if (!workflow) return null;
  const plain = typeof workflow.toObject === "function" ? workflow.toObject() : { ...workflow };
  return {
    ...plain,
    actions: Array.isArray(plain.actions) ? plain.actions : [],
    conditions: Array.isArray(plain.conditions) ? plain.conditions : [],
    trigger: plain.trigger || { type: "event", eventName: "" }
  };
}

module.exports = {
  compileWorkflow
};
