const app = require("./app");
const { port } = require("./config/env");
const { connectDatabase } = require("./config/database");
const { startSubscriptionRenewalSchedule } = require("./services/subscriptionRenewalJob");
const { startSmartAlertSchedule } = require("./jobs/smartAlertJob");
const { initWorkflowEngine } = require("./workflow/engine/workflowEngine");
const { bootRuntime } = require("./runtime/runtime");

async function bootstrap() {
  await connectDatabase();
  startSubscriptionRenewalSchedule();
  startSmartAlertSchedule();
  initWorkflowEngine();
  bootRuntime();

  app.listen(port, () => {
    console.log(`[api] Associacao BolePix rodando na porta ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("[api] erro ao iniciar", error);
  process.exit(1);
});
