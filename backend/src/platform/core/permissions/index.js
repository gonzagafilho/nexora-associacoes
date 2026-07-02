const { registry } = require("../../appRegistry");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function appPermissions(appId) {
  const app = registry.get(appId);
  return app ? app.permissions || [] : [];
}

function allowedForApp({ appId, role = "", enabledModules = [] }) {
  const required = appPermissions(appId);
  const userRole = normalize(role);
  if (["owner", "admin", "superadmin"].includes(userRole)) return true;

  const modules = new Set((Array.isArray(enabledModules) ? enabledModules : []).map(normalize));
  return required.every((permission) => {
    const value = normalize(permission);
    if (!value) return true;
    if (value.startsWith("module:")) {
      return modules.has(value.split(":")[1]);
    }
    if (value.startsWith("role:")) {
      return userRole === value.split(":")[1];
    }
    return true;
  });
}

module.exports = {
  appPermissions,
  allowedForApp
};
