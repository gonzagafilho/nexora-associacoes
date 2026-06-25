function validateWorkflowDefinition(payload = {}) {
  const errors = [];
  const name = String(payload.name || "").trim();
  const trigger = payload.trigger || {};
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  if (!name) errors.push("name é obrigatório.");
  if (!trigger || typeof trigger !== "object") errors.push("trigger é obrigatório.");
  if (!String(trigger.type || "").trim()) errors.push("trigger.type é obrigatório.");
  if (String(trigger.type || "").trim() === "event" && !String(trigger.eventName || "").trim()) {
    errors.push("trigger.eventName é obrigatório para trigger do tipo event.");
  }
  if (!actions.length) errors.push("actions deve conter ao menos uma ação.");

  actions.forEach((action, index) => {
    if (!action || typeof action !== "object") {
      errors.push(`actions[${index}] deve ser um objeto.`);
      return;
    }
    if (!String(action.type || "").trim()) {
      errors.push(`actions[${index}].type é obrigatório.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateWorkflowDefinition
};
