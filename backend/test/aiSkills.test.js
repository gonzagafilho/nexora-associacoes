const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const { registry } = require("../src/modules/ai/skills/registry");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  execute: registry.execute
};

afterEach(() => {
  registry.execute = originals.execute;
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId) {
  return jwt.sign(
    {
      sub: userId,
      tenantId: currentTenantId,
      role: "owner",
      email: "owner@nexora.test",
      enabledModules: ["core", "memberbilling", "associates", "protocols", "projects", "notifications"]
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

test("GET /api/ai/skills lista skills registradas", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/skills", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.skills), true);
    assert.ok(body.skills.some((skill) => skill.name === "finance"));
    assert.ok(body.skills.some((skill) => skill.name === "associate"));
    assert.ok(body.skills.some((skill) => skill.name === "protocol"));
  });
});

test("POST /api/ai/skills/execute executa via registry", async () => {
  let captured = null;
  registry.execute = async (name, payload, context) => {
    captured = { name, payload, context };
    return {
      ok: true,
      skill: name,
      durationMs: 20,
      confirmationRequired: false,
      data: { skill: name, count: 1 }
    };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/skills/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ name: "associate.find", payload: { q: "joao" } })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.skill, "associate.find");
  });

  assert.ok(captured);
  assert.equal(captured.name, "associate.find");
  assert.equal(captured.payload.q, "joao");
  assert.equal(String(captured.context.tenantId), tenantId);
});

test("registry bloqueia execução cross-tenant por contexto", async () => {
  let seenTenant = "";
  registry.execute = async (_name, _payload, context) => {
    seenTenant = String(context.tenantId);
    if (seenTenant !== otherTenantId) {
      const error = new Error("tenant inválido");
      error.statusCode = 403;
      throw error;
    }
    return { ok: true, skill: "protocol.list", durationMs: 5, confirmationRequired: false, data: { count: 0 } };
  };

  await withServer(async (baseUrl) => {
    const denied = await fetch(baseUrl + "/api/ai/skills/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken(tenantId) },
      body: JSON.stringify({ name: "protocol.list", payload: {} })
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedBody.ok, false);

    const allowed = await fetch(baseUrl + "/api/ai/skills/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken(otherTenantId) },
      body: JSON.stringify({ name: "protocol.list", payload: {} })
    });
    const allowedBody = await allowed.json();
    assert.equal(allowed.status, 200);
    assert.equal(allowedBody.ok, true);
  });

  assert.equal(seenTenant, otherTenantId);
});
