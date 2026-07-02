const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const orchestratorService = require("../src/modules/ai/orchestrator/orchestrator.service");
const { registry } = require("../src/modules/ai/skills/registry");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  plan: orchestratorService.plan,
  execute: orchestratorService.execute,
  statusSummary: orchestratorService.statusSummary,
  listPlans: orchestratorService.listPlans,
  getPlan: orchestratorService.getPlan,
  executeRegistry: registry.execute
};

afterEach(() => {
  orchestratorService.plan = originals.plan;
  orchestratorService.execute = originals.execute;
  orchestratorService.statusSummary = originals.statusSummary;
  orchestratorService.listPlans = originals.listPlans;
  orchestratorService.getPlan = originals.getPlan;
  registry.execute = originals.executeRegistry;
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId, role = "owner", enabledModules = ["core", "memberbilling", "associates", "protocols", "projects", "notifications"]) {
  return jwt.sign(
    {
      sub: userId,
      tenantId: currentTenantId,
      role,
      email: "owner@nexora.test",
      enabledModules
    },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

async function withServer(callback) {
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /api/ai/orchestrator/plan cria plano com 3 skills", async () => {
  orchestratorService.plan = async () => ({
    ok: true,
    plan: {
      id: "plan-1",
      intent: "protocol_followup",
      projectKey: "associacoes",
      status: "planned",
      steps: [
        { skill: "protocol.create", status: "pending" },
        { skill: "notification.whatsapp", status: "pending" },
        { skill: "workflow.start", status: "pending" }
      ]
    },
    policy: { ok: true, blocked: false, requiresConfirmation: true }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/orchestrator/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ message: "abrir protocolo, notificar no whatsapp e iniciar workflow", projectKey: "associacoes" })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.plan.intent, "protocol_followup");
    assert.equal(Array.isArray(body.plan.steps), true);
    assert.equal(body.plan.steps.length, 3);
  });
});

test("POST /api/ai/orchestrator/execute executa plano", async () => {
  orchestratorService.execute = async () => ({
    ok: true,
    plan: { id: "plan-1", status: "success" },
    execution: {
      ok: true,
      success: true,
      executedSteps: 3,
      totalSteps: 3,
      totalDurationMs: 120,
      failedStep: "",
      errorMessage: ""
    }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/orchestrator/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ planId: "plan-1", confirm: true })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.execution.success, true);
    assert.equal(body.execution.executedSteps, 3);
  });
});

test("POST /api/ai/orchestrator/execute bloqueia por permissão", async () => {
  orchestratorService.execute = async () => {
    const error = new Error("Permissão insuficiente para executar finance.createBolePix.");
    error.statusCode = 403;
    throw error;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/orchestrator/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken(tenantId, "member", ["core"]) },
      body: JSON.stringify({ planId: "plan-locked", confirm: true })
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.ok, false);
  });
});

test("POST /api/ai/orchestrator/plan bloqueia skill inexistente", async () => {
  orchestratorService.plan = async () => {
    const error = new Error("Skill não encontrada: missing");
    error.statusCode = 404;
    throw error;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/orchestrator/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "executar skill inexistente", steps: [{ skill: "missing.action", payload: {} }] })
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

test("GET /api/ai/orchestrator/plans/:id respeita isolamento por tenant", async () => {
  orchestratorService.getPlan = ({ tenantId: scopedTenantId, id }) => {
    if (String(scopedTenantId) !== otherTenantId || id !== "plan-1") return null;
    return { id: "plan-1", tenantId: otherTenantId, status: "planned", steps: [] };
  };

  await withServer(async (baseUrl) => {
    const denied = await fetch(baseUrl + "/api/ai/orchestrator/plans/plan-1", {
      headers: { Authorization: "Bearer " + authToken(tenantId) }
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 404);
    assert.equal(deniedBody.ok, false);

    const allowed = await fetch(baseUrl + "/api/ai/orchestrator/plans/plan-1", {
      headers: { Authorization: "Bearer " + authToken(otherTenantId) }
    });
    const allowedBody = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(allowedBody.ok, true);
    assert.equal(allowedBody.plan.id, "plan-1");
  });
});
