const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const TenantMemory = require("../src/modules/memory/memory.model");
const memoryService = require("../src/modules/memory/memory.service");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  countDocuments: TenantMemory.countDocuments,
  aggregate: TenantMemory.aggregate,
  find: TenantMemory.find,
  createMemory: memoryService.createMemory,
  listMemories: memoryService.listMemories,
  searchMemories: memoryService.searchMemories,
  getMemory: memoryService.getMemory,
  updateMemory: memoryService.updateMemory,
  deleteMemory: memoryService.deleteMemory
};

afterEach(() => {
  TenantMemory.countDocuments = originals.countDocuments;
  TenantMemory.aggregate = originals.aggregate;
  TenantMemory.find = originals.find;
  memoryService.createMemory = originals.createMemory;
  memoryService.listMemories = originals.listMemories;
  memoryService.searchMemories = originals.searchMemories;
  memoryService.getMemory = originals.getMemory;
  memoryService.updateMemory = originals.updateMemory;
  memoryService.deleteMemory = originals.deleteMemory;
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

test("CRUD de memórias via API funciona para o painel", async () => {
  const store = [];

  memoryService.createMemory = async ({ tenantId: scopedTenantId, data }) => {
    const memory = {
      id: "memory-1",
      tenantId: String(scopedTenantId),
      projectKey: data.projectKey || "associacoes",
      scope: data.scope || "organization",
      title: data.title,
      content: data.content,
      tags: Array.isArray(data.tags) ? data.tags : [],
      importance: Number(data.importance || 1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.push(memory);
    return memory;
  };

  memoryService.listMemories = async ({ tenantId: scopedTenantId }) => {
    return store.filter((item) => item.tenantId === String(scopedTenantId));
  };

  memoryService.searchMemories = async ({ tenantId: scopedTenantId, q }) => {
    const term = String(q || "").toLowerCase();
    return store.filter((item) => item.tenantId === String(scopedTenantId) && (`${item.title} ${item.content}`.toLowerCase().includes(term)));
  };

  memoryService.getMemory = async ({ tenantId: scopedTenantId, id }) => {
    return store.find((item) => item.id === id && item.tenantId === String(scopedTenantId)) || null;
  };

  memoryService.updateMemory = async ({ tenantId: scopedTenantId, id, data }) => {
    const entry = store.find((item) => item.id === id && item.tenantId === String(scopedTenantId));
    if (!entry) return null;
    Object.assign(entry, data, { updatedAt: new Date().toISOString() });
    return entry;
  };

  memoryService.deleteMemory = async ({ tenantId: scopedTenantId, id }) => {
    const index = store.findIndex((item) => item.id === id && item.tenantId === String(scopedTenantId));
    if (index < 0) return null;
    const [removed] = store.splice(index, 1);
    return removed;
  };

  await withServer(async (baseUrl) => {
    const authHeaders = { "Content-Type": "application/json", Authorization: "Bearer " + authToken() };

    const createdResponse = await fetch(baseUrl + "/api/memory", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ projectKey: "associacoes", scope: "organization", title: "Memoria inicial", content: "Detalhes", tags: ["mvp"], importance: 3 })
    });
    const createdBody = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.equal(createdBody.ok, true);
    assert.equal(createdBody.memory.title, "Memoria inicial");

    const listedResponse = await fetch(baseUrl + "/api/memory", { headers: { Authorization: "Bearer " + authToken() } });
    const listedBody = await listedResponse.json();
    assert.equal(listedResponse.status, 200);
    assert.equal(listedBody.ok, true);
    assert.equal(listedBody.memories.length, 1);

    const searchedResponse = await fetch(baseUrl + "/api/memory?q=inicial", { headers: { Authorization: "Bearer " + authToken() } });
    const searchedBody = await searchedResponse.json();
    assert.equal(searchedResponse.status, 200);
    assert.equal(searchedBody.memories.length, 1);

    const updatedResponse = await fetch(baseUrl + "/api/memory/memory-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ projectKey: "associacoes", title: "Memoria editada", content: "Atualizado", importance: 4 })
    });
    const updatedBody = await updatedResponse.json();
    assert.equal(updatedResponse.status, 200);
    assert.equal(updatedBody.ok, true);
    assert.equal(updatedBody.memory.title, "Memoria editada");

    const deletedResponse = await fetch(baseUrl + "/api/memory/memory-1?projectKey=associacoes", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + authToken() }
    });
    const deletedBody = await deletedResponse.json();
    assert.equal(deletedResponse.status, 200);
    assert.equal(deletedBody.ok, true);

    const listedAfterDelete = await fetch(baseUrl + "/api/memory", { headers: { Authorization: "Bearer " + authToken() } });
    const listedAfterDeleteBody = await listedAfterDelete.json();
    assert.equal(listedAfterDelete.status, 200);
    assert.equal(listedAfterDeleteBody.memories.length, 0);
  });
});
