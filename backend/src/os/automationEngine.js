const automations = new Map();

function normalizeRule(rule = {}) {
  return {
    id: String(rule.id || "").trim(),
    name: String(rule.name || "").trim(),
    when: rule.when,
    then: rule.then,
    enabled: rule.enabled !== false
  };
}

function registerAutomation(rule) {
  const normalized = normalizeRule(rule);
  if (!normalized.id || !normalized.name) {
    throw new Error("automationEngine.registerAutomation requer id e name.");
  }
  automations.set(normalized.id, normalized);
  return { ...normalized };
}

function listAutomations() {
  return [...automations.values()].map((item) => ({ ...item }));
}

function matchesRule(rule, event) {
  if (!rule.enabled) return false;
  if (typeof rule.when === "function") {
    return Boolean(rule.when(event));
  }
  if (typeof rule.when === "string") {
    return rule.when === event;
  }
  if (rule.when && typeof rule.when === "object" && typeof rule.when.event === "string") {
    return rule.when.event === event;
  }
  return false;
}

function evaluateAutomation(event, context = {}) {
  const matchedRules = listAutomations().filter((rule) => matchesRule(rule, event));
  return {
    event,
    matched: matchedRules.length > 0,
    matches: matchedRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      then: rule.then,
      simulated: true
    })),
    context
  };
}

module.exports = {
  registerAutomation,
  listAutomations,
  evaluateAutomation
};
