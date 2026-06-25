const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  bootKernel,
  getKernelInfo,
  getRegisteredEngines,
  getKernelCapabilities
} = require("../src/os/kernel");
const {
  publish,
  subscribe,
  getEventStats,
  clearSubscribersForTest
} = require("../src/os/eventBus");
const { registerWorkflow, listWorkflows, runWorkflow } = require("../src/os/workflowEngine");
const { registerAutomation, evaluateAutomation } = require("../src/os/automationEngine");
const { canAccessModule } = require("../src/os/permissionEngine");
const { registerDriver, getDriver, listDrivers, getDefaultDriver } = require("../src/os/driverRegistry");

test("kernel info retorna online", () => {
  bootKernel();
  const kernel = getKernelInfo();
  const engines = getRegisteredEngines();
  const capabilities = getKernelCapabilities();

  assert.equal(kernel.name, "NEXORA OS Kernel");
  assert.equal(kernel.version, "1.0.0");
  assert.equal(kernel.status, "online");
  assert.ok(Array.isArray(kernel.engines));
  assert.ok(engines.includes("eventBus"));
  assert.equal(capabilities.events, true);
});

test("eventBus publica evento e entrega handler", async () => {
  clearSubscribersForTest();

  let deliveredPayload = null;
  subscribe("project.created", ({ payload }) => {
    deliveredPayload = payload;
  });

  const result = await publish("project.created", { id: "PRJ-1" }, { tenantId: "t1" });

  assert.equal(result.eventName, "project.created");
  assert.equal(result.delivered, 1);
  assert.equal(result.failed, 0);
  assert.equal(deliveredPayload.id, "PRJ-1");
  assert.equal(getEventStats().byEvent["project.created"].published, 1);
});

test("eventBus não quebra quando handler falha", async () => {
  clearSubscribersForTest();

  subscribe("invoice.paid", () => {
    throw new Error("falha esperada");
  });
  subscribe("invoice.paid", () => true);

  const result = await publish("invoice.paid", { id: "INV-1" }, { tenantId: "t1" });

  assert.equal(result.delivered, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
});

test("workflowEngine registra workflow", () => {
  const id = "wf-kernel-test";
  registerWorkflow({
    id,
    name: "Fluxo de boas-vindas",
    trigger: "tenant.created",
    enabled: true,
    steps: ["send-email", "create-notification"]
  });

  const workflows = listWorkflows();
  const created = workflows.find((workflow) => workflow.id === id);
  const execution = runWorkflow("tenant.created", { tenantId: "t1" }, { userId: "u1" });

  assert.ok(created);
  assert.equal(created.name, "Fluxo de boas-vindas");
  assert.equal(execution.simulated, true);
  assert.ok(execution.matched >= 1);
});

test("automationEngine avalia regra simples", () => {
  const id = "auto-kernel-test";
  registerAutomation({
    id,
    name: "Avisar pagamento",
    when: "invoice.paid",
    then: "emit-notification",
    enabled: true
  });

  const evaluation = evaluateAutomation("invoice.paid", { tenantId: "t1" });

  assert.equal(evaluation.event, "invoice.paid");
  assert.equal(evaluation.matched, true);
  assert.ok(evaluation.matches.some((item) => item.id === id));
});

test("permissionEngine respeita módulo ativo", () => {
  const admin = {
    role: "admin",
    enabledModules: ["financial"]
  };

  assert.equal(canAccessModule(admin, "financial"), true);
  assert.equal(canAccessModule(admin, "projects"), false);
});

test("driverRegistry registra e lista driver", () => {
  registerDriver("email", "smtp-kernel-test", { provider: "smtp", status: "placeholder" }, { default: true });

  const driver = getDriver("email", "smtp-kernel-test");
  const listed = listDrivers();
  const defaultDriver = getDefaultDriver("email");

  assert.equal(driver?.provider, "smtp");
  assert.ok(Array.isArray(listed.email?.drivers));
  assert.ok(listed.email.drivers.some((item) => item.name === "smtp-kernel-test"));
  assert.equal(defaultDriver?.name, "smtp-kernel-test");
});
