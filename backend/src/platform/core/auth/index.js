function resolveIdentity(user = {}) {
  return {
    tenantId: String(user.tenantId || ""),
    userId: String(user.id || user.sub || ""),
    role: String(user.role || "").trim().toLowerCase(),
    email: String(user.email || "").trim().toLowerCase(),
    enabledModules: Array.isArray(user.enabledModules) ? user.enabledModules : []
  };
}

module.exports = {
  resolveIdentity
};
