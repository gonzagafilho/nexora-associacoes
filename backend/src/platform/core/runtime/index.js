const { getRuntimeHealth } = require("../../../runtime/runtimeHealthService");
const runtime = require("../../../runtime/runtime");

async function health({ tenantId, userId, role, modules = [] }) {
  runtime.bootRuntime();
  const context = runtime.context().createTenantContext({
    tenantId,
    userId,
    role,
    modules
  });
  const info = runtime.getRuntimeInfo();
  const status = runtime.getRuntimeStatus();
  const healthData = await getRuntimeHealth(context);
  return {
    info,
    status,
    health: healthData
  };
}

module.exports = {
  health
};
