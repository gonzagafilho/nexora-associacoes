const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const TenantMemory = require("../src/modules/memory/memory.model");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  countDocuments: TenantMemory.countDocuments,
  aggregate: TenantMemory.aggregate,
  find: TenantMemory.find
};

afterEach(() => {
  TenantMemory.countDocuments = originals.countDocuments;
  TenantMemory.aggregate = originals.aggregate;
  TenantMemory.find = originals.find;
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

function chain(value, capture = {}) {
  return {
    sort(sortValue) {
      capture.sort = sortValue;
      return this;
    },
    limit(limitValue) {
      capture.limit = limitValue;
      return this;
    },
    lean: async () => value
  };
}

function assertTenantFilter(filter, expectedTenantId) {
  assert.equal(String(filter.tenantId), expectedTenantId);
}

test("GET /api/memory/stats retorna resumo por tenant", async () => {
  TenantMemory.countDocuments = async (filter) => {
    assertTenantFilter(filter, tenantId);
    return 3;
  };

  TenantMemory.aggregate = async (pipeline) => {
    const match = pipeline[0].$match || {};
    assertTenantFilter(match, tenantId);
    const groupId = pipeline[1]?.$group?._id;
    if (groupId && typeof groupId === "object" && groupId.$ifNull) {
      return [{ _id: "associacoes", total: 2 }, { _id: "guardian", total: 1 }];
    }
    return [{ _id: "organization", total: 2 }, { _id: "financial", total: 1 }];
  };

  TenantMemory.find = (filter) => {
    assertTenantFilter(filter, tenantId);
    return chain([
      {
        _id: "507f1f77bcf86cd799439041",
        tenantId,
        projectKey: "associacoes",
        scope: "organization",
        title: "Preferencia de contato",
        content: "Usar WhatsApp no horario comercial.",
        tags: ["contato"],
        importance: 3,
        source: "manual",
        visibility: "tenant",
        createdAt: new Date("2026-07-01T10:00:00.000Z"),
        updatedAt: new Date("2026-07-01T10:00:00.000Z")
      }
    ]);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/memory/stats", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.total, 3);
    assert.deepEqual(body.byProject, [
      { projectKey: "associacoes", total: 2 },
      { projectKey: "guardian", total: 1 }
    ]);
    assert.deepEqual(body.byScope, [
      { scope: "organization", total: 2 },
      { scope: "financial", total: 1 }
    ]);
    assert.equal(Array.isArray(body.recent), true);
    assert.equal(body.recent.length, 1);
    assert.equal(body.recent[0].title, "Preferencia de contato");
  });
});

test("GET /api/memory/stats ignora tenantId do corpo e usa token", async () => {
  const requestedTenantFilters = [];

  TenantMemory.countDocuments = async (filter) => {
    requestedTenantFilters.push(String(filter.tenantId));
    return 0;
  };

  TenantMemory.aggregate = async (pipeline) => {
    requestedTenantFilters.push(String(pipeline[0].$match.tenantId));
    return [];
  };

  TenantMemory.find = (filter) => {
    requestedTenantFilters.push(String(filter.tenantId));
    return chain([]);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/memory/stats?tenantId=" + tenantId, {
      headers: { Authorization: "Bearer " + authToken(otherTenantId) }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  });

  assert.ok(requestedTenantFilters.length > 0);
  assert.ok(requestedTenantFilters.every((item) => item === otherTenantId));
});
