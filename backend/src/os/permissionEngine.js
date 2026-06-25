const { normalizeModuleCode, normalizeModuleCodes } = require("../services/subscription/subscriptionPricingService");

const OPERATOR_ALLOWED_ACTIONS = new Set([
  "view",
  "list",
  "read",
  "create",
  "update"
]);

function userRole(user) {
  return String(user?.role || "operator").toLowerCase();
}

function resolveEnabledModules(user = {}) {
  return normalizeModuleCodes(
    user?.enabledModules ||
      user?.tenant?.enabledModules ||
      user?.context?.enabledModules ||
      []
  );
}

function canAccessModule(user, moduleCode) {
  const role = userRole(user);
  if (role === "owner") return true;

  const normalizedModuleCode = normalizeModuleCode(moduleCode);
  if (!normalizedModuleCode) return false;

  const enabledSet = new Set(resolveEnabledModules(user));
  const moduleEnabled = enabledSet.has(normalizedModuleCode);

  if (role === "admin") {
    return moduleEnabled;
  }

  if (role === "operator") {
    const operatorModules = normalizeModuleCodes(user?.allowedModules || user?.permissions?.modules || []);
    if (!operatorModules.length) {
      return moduleEnabled;
    }
    return moduleEnabled && operatorModules.includes(normalizedModuleCode);
  }

  return false;
}

function canPerform(user, action, resource = {}) {
  const role = userRole(user);
  if (role === "owner") return true;

  const normalizedAction = String(action || "").toLowerCase().trim();
  const moduleCode = resource?.moduleCode || resource?.module;

  if (!canAccessModule(user, moduleCode)) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  if (role === "operator") {
    if (OPERATOR_ALLOWED_ACTIONS.has(normalizedAction)) {
      return true;
    }
    const explicitActions = Array.isArray(user?.permissions?.actions)
      ? user.permissions.actions.map((item) => String(item).toLowerCase())
      : [];
    return explicitActions.includes(normalizedAction);
  }

  return false;
}

function describePermissions(user) {
  const role = userRole(user);
  const enabledModules = resolveEnabledModules(user);

  return {
    role,
    enabledModules,
    rules: {
      owner: role === "owner",
      adminRequiresActiveModule: role === "admin",
      operatorLimitedByRole: role === "operator"
    }
  };
}

module.exports = {
  canAccessModule,
  canPerform,
  describePermissions
};
