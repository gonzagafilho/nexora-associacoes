const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const aiActivityLogService = require("../src/modules/ai/aiActivityLog.service");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  listActivityLogs: aiActivityLogService.listActivityLogs,
  getActivityLogStats: aiActivityLogService.getActivityLogStats,
  getActivityLogById: aiActivityLogService.getActivityLogById
};

afterEach(() => {
  aiActivityLogService.listActivityLogs = originals.listActivityLogs;
  aiActivityLogService.getActivityLogStats = originals.getActivityLogStats;
  aiActivityLogService.getActivityLogById = originals.getActivityLogById;
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId) {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role: "owner", email: "owner@nexora.test" },
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

test("GET /api/ai/activity-logs lista logs reais com filtros", async () => {
  let captured = null;

  aiActivityLogService.listActivityLogs = async (payload) => {
    captured = payload;
    return [
      {
        id: "log-1",
        tenantId: String(payload.tenantId),
        userId,
        projectKey: "associacoes",
        module: "NEXORA IA",
        action: "balance",
        question: "Qual meu saldo?",
        answer: "Saldo atual",
        memoryIds: ["m-1", "m-2"],
        memoryCount: 2,
        memoryContextPreview: "Saldo financeiro",
        status: "success",
        errorMessage: "",
        durationMs: 110,
        metadata: {},
        createdAt: new Date().toISOString()
      }
    ];
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/activity-logs?projectKey=associacoes&status=success&q=saldo", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.logs), true);
    assert.equal(body.logs.length, 1);
    assert.equal(body.logs[0].question, "Qual meu saldo?");
  });

  assert.ok(captured);
  assert.equal(String(captured.tenantId), tenantId);
  assert.equal(captured.query.projectKey, "associacoes");
  assert.equal(captured.query.status, "success");
  assert.equal(captured.query.q, "saldo");
});

test("GET /api/ai/activity-logs/stats retorna resumo por tenant", async () => {
  let captured = null;

  aiActivityLogService.getActivityLogStats = async (payload) => {
    captured = payload;
    return {
      total: 7,
      success: 6,
      error: 1,
      avgDurationMs: 95,
      byProject: [{ projectKey: "associacoes", total: 5 }, { projectKey: "guardian", total: 2 }],
      recent: [{ id: "log-2", status: "success", question: "Fluxo de caixa", createdAt: new Date().toISOString() }]
    };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/activity-logs/stats?projectKey=guardian", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.total, 7);
    assert.equal(body.success, 6);
    assert.equal(body.error, 1);
    assert.equal(body.avgDurationMs, 95);
    assert.equal(Array.isArray(body.byProject), true);
    assert.equal(Array.isArray(body.recent), true);
  });

  assert.ok(captured);
  assert.equal(String(captured.tenantId), tenantId);
  assert.equal(captured.query.projectKey, "guardian");
});

test("GET /api/ai/activity-logs/:id respeita isolamento cross-tenant", async () => {
  aiActivityLogService.getActivityLogById = async ({ tenantId: scopedTenantId, id }) => {
    if (String(scopedTenantId) !== otherTenantId || id !== "log-1") return null;
    return {
      id: "log-1",
      tenantId: String(scopedTenantId),
      projectKey: "xpdcnet",
      status: "error",
      question: "teste",
      answer: "",
      memoryIds: [],
      memoryCount: 0,
      memoryContextPreview: "",
      errorMessage: "falha",
      durationMs: 10,
      metadata: {},
      createdAt: new Date().toISOString()
    };
  };

  await withServer(async (baseUrl) => {
    const denied = await fetch(baseUrl + "/api/ai/activity-logs/log-1", {
      headers: { Authorization: "Bearer " + authToken(tenantId) }
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 404);
    assert.equal(deniedBody.ok, false);

    const allowed = await fetch(baseUrl + "/api/ai/activity-logs/log-1", {
      headers: { Authorization: "Bearer " + authToken(otherTenantId) }
    });
    const allowedBody = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(allowedBody.ok, true);
    assert.equal(allowedBody.log.projectKey, "xpdcnet");
  });
});
