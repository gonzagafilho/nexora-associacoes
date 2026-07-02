const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const platformService = require("../src/platform/platform.service");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

const originals = {
  listApps: platformService.listApps,
  platformStatus: platformService.platformStatus,
  coreOverview: platformService.coreOverview,
  modulesOverview: platformService.modulesOverview,
  appDashboard: platformService.appDashboard
};

afterEach(() => {
  platformService.listApps = originals.listApps;
  platformService.platformStatus = originals.platformStatus;
  platformService.coreOverview = originals.coreOverview;
  platformService.modulesOverview = originals.modulesOverview;
  platformService.appDashboard = originals.appDashboard;
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId) {
  return jwt.sign(
    {
      sub: userId,
      tenantId: currentTenantId,
      role: "owner",
      email: "owner@nexora.test",
      enabledModules: ["core", "memberbilling", "associates", "protocols", "projects", "notifications", "financial"]
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

test("GET /api/platform/apps lista apps registrados", async () => {
  platformService.listApps = async () => ({
    total: 7,
    active: 7,
    apps: [{ id: "associacoes", name: "NEXORA Associações", enabled: true }]
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/platform/apps", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.total, 7);
    assert.equal(Array.isArray(body.apps), true);
    assert.equal(body.apps[0].id, "associacoes");
  });
});

test("GET /api/platform/status retorna dashboard da plataforma", async () => {
  platformService.platformStatus = async () => ({
    version: "4.2.0",
    health: "online",
    installedApps: 7,
    activeApps: 7,
    skills: 10,
    agents: 7,
    memories: 22,
    events: 41,
    runtime: "online"
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/platform/status", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.health, "online");
    assert.equal(body.installedApps, 7);
    assert.equal(body.activeApps, 7);
  });
});

test("GET /api/platform/core e /modules funcionam", async () => {
  platformService.coreOverview = async () => ({
    core: { ai: "adapter-ready", memory: "adapter-ready" },
    contextSummary: { appId: "associacoes", projectKey: "associacoes", allowed: true }
  });
  platformService.modulesOverview = () => ({
    total: 3,
    modules: [
      { module: "core", apps: ["associacoes", "guardian"] },
      { module: "financial", apps: ["associacoes"] }
    ]
  });

  await withServer(async (baseUrl) => {
    const coreResponse = await fetch(baseUrl + "/api/platform/core", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const coreBody = await coreResponse.json();
    assert.equal(coreResponse.status, 200);
    assert.equal(coreBody.ok, true);
    assert.equal(coreBody.core.ai, "adapter-ready");

    const modulesResponse = await fetch(baseUrl + "/api/platform/modules", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const modulesBody = await modulesResponse.json();
    assert.equal(modulesResponse.status, 200);
    assert.equal(modulesBody.ok, true);
    assert.equal(Array.isArray(modulesBody.modules), true);
    assert.equal(modulesBody.modules[0].module, "core");
  });
});

test("GET /api/platform/apps/:appId retorna dashboard do app", async () => {
  platformService.appDashboard = async () => ({
    app: { id: "associacoes", name: "NEXORA Associações", version: "4.2.0" },
    status: "active",
    version: "4.2.0",
    modules: ["core", "associates"],
    skillsUsed: ["associate", "finance"],
    memories: 10,
    logs: { recentPlans: 2 },
    events: { totalEvents: 5 },
    permissions: { allowed: true }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/platform/apps/associacoes", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.app.id, "associacoes");
    assert.equal(body.status, "active");
  });
});
