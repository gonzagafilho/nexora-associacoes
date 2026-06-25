const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Associate = require("../src/models/Associate");
const Asset = require("../src/models/Asset");
const AssetHistory = require("../src/models/AssetHistory");
const OsEventLog = require("../src/models/OsEventLog");
const Project = require("../src/models/Project");
const Protocol = require("../src/models/Protocol");
const ProtocolHistory = require("../src/models/ProtocolHistory");
const { clearSubscribersForTest, subscribe } = require("../src/os/eventBus");
const publisher = require("../src/os/osEventPublisher");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

const originals = {
  associateCreate: Associate.create,
  assetCreate: Asset.create,
  assetFindOne: Asset.findOne,
  assetFindById: Asset.findById,
  assetHistoryCreate: AssetHistory.create,
  projectCreate: Project.create,
  protocolCreate: Protocol.create,
  protocolFindOne: Protocol.findOne,
  protocolFindById: Protocol.findById,
  protocolHistoryCreate: ProtocolHistory.create,
  osEventCreate: OsEventLog.create,
  osEventCountDocuments: OsEventLog.countDocuments,
  osEventFind: OsEventLog.find,
  osEventAggregate: OsEventLog.aggregate,
  publishOsEvent: publisher.publishOsEvent
};

afterEach(() => {
  Associate.create = originals.associateCreate;
  Asset.create = originals.assetCreate;
  Asset.findOne = originals.assetFindOne;
  Asset.findById = originals.assetFindById;
  AssetHistory.create = originals.assetHistoryCreate;
  Project.create = originals.projectCreate;
  Protocol.create = originals.protocolCreate;
  Protocol.findOne = originals.protocolFindOne;
  Protocol.findById = originals.protocolFindById;
  ProtocolHistory.create = originals.protocolHistoryCreate;
  OsEventLog.create = originals.osEventCreate;
  OsEventLog.countDocuments = originals.osEventCountDocuments;
  OsEventLog.find = originals.osEventFind;
  OsEventLog.aggregate = originals.osEventAggregate;
  publisher.publishOsEvent = originals.publishOsEvent;
  clearSubscribersForTest();
  delete require.cache[require.resolve("../src/modules/associates/associates.routes")];
  delete require.cache[require.resolve("../src/modules/projects/projects.routes")];
  delete require.cache[require.resolve("../src/modules/assets/assets.routes")];
  delete require.cache[require.resolve("../src/modules/protocols/protocols.routes")];
  delete require.cache[require.resolve("../src/modules/system/system.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(enabledModules = ["associates", "projects", "assets", "protocols", "memberbilling", "financial"]) {
  return jwt.sign(
    { sub: userId, tenantId, role: "owner", email: "owner@nexora.test", enabledModules },
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
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("publishOsEvent sanitiza payload sensível e registra OsEventLog", async () => {
  const createdRows = [];
  OsEventLog.create = async (payload) => {
    createdRows.push(payload);
    return { _id: "507f1f77bcf86cd799439501", ...payload };
  };

  const result = await publisher.publishOsEvent("ai.message", {
    tenantId,
    userId,
    module: "ai",
    action: "message",
    entityId: "abc",
    entityType: "AiConversation",
    payload: {
      question: "teste",
      token: "secret-token",
      nested: {
        password: "123",
        authorization: "bearer x",
        safe: true
      },
      gatewayResponse: { any: true }
    }
  }, { tenantId, userId });

  assert.equal(result.eventName, "ai.message");
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].payload.token, undefined);
  assert.equal(createdRows[0].payload.nested.password, undefined);
  assert.equal(createdRows[0].payload.nested.authorization, undefined);
  assert.equal(createdRows[0].payload.gatewayResponse, undefined);
  assert.equal(createdRows[0].payload.nested.safe, true);
});

test("falha em handler do EventBus não quebra publishOsEvent", async () => {
  OsEventLog.create = async (payload) => ({ _id: "507f1f77bcf86cd799439502", ...payload });
  subscribe("project.created", () => {
    throw new Error("falha handler");
  });

  const result = await publisher.publishOsEvent("project.created", {
    tenantId,
    userId,
    module: "projects",
    action: "created",
    entityId: "507f1f77bcf86cd799439071",
    entityType: "Project",
    payload: { name: "Reforma" }
  }, { tenantId, userId });

  assert.equal(result.failed, 1);
  assert.equal(result.delivered, 0);
  assert.equal(Array.isArray(result.errors), true);
});

test("criar associado publica associate.created", async () => {
  const published = [];
  publisher.publishOsEvent = async (eventName) => {
    published.push(eventName);
    return { ok: true, eventName, delivered: 0, failed: 0, errors: [] };
  };

  Associate.create = async (payload) => ({ _id: "507f1f77bcf86cd799439061", ...payload });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/associates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ name: "Maria", cpf: "123" })
    });
    assert.equal(response.status, 201);
  });

  assert.ok(published.includes("associate.created"));
});

test("criar projeto publica project.created", async () => {
  const published = [];
  publisher.publishOsEvent = async (eventName) => {
    published.push(eventName);
    return { ok: true, eventName, delivered: 0, failed: 0, errors: [] };
  };

  Project.create = async (payload) => ({ _id: "507f1f77bcf86cd799439071", ...payload });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ name: "Projeto X", type: "obra", status: "planning" })
    });
    assert.equal(response.status, 201);
  });

  assert.ok(published.includes("project.created"));
});

test("criar patrimônio publica asset.created", async () => {
  const published = [];
  publisher.publishOsEvent = async (eventName) => {
    published.push(eventName);
    return { ok: true, eventName, delivered: 0, failed: 0, errors: [] };
  };

  Asset.findOne = () => ({
    sort() {
      return { select: () => ({ lean: async () => ({ assetCode: "AST-000010" }) }) };
    }
  });
  const createdAsset = {
    _id: "507f1f77bcf86cd799439081",
    tenantId,
    assetCode: "AST-000011",
    name: "Servidor",
    category: "equipamento",
    status: "active",
    save: async function save() { return this; }
  };
  Asset.create = async () => createdAsset;
  Asset.findById = () => ({ populate: async () => createdAsset });
  AssetHistory.create = async () => ({ ok: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ name: "Servidor", category: "outro", currentValue: 1200 })
    });
    assert.equal(response.status, 201);
  });

  assert.ok(published.includes("asset.created"));
});

test("criar protocolo publica protocol.created", async () => {
  const published = [];
  publisher.publishOsEvent = async (eventName) => {
    published.push(eventName);
    return { ok: true, eventName, delivered: 0, failed: 0, errors: [] };
  };

  Protocol.findOne = () => ({
    sort() {
      return { select: () => ({ lean: async () => ({ protocolNumber: "PROTO-000001" }) }) };
    }
  });

  const created = {
    _id: "507f1f77bcf86cd799439181",
    tenantId,
    protocolNumber: "PROTO-000002",
    title: "Chamado",
    status: "open",
    priority: "medium"
  };

  Protocol.create = async () => created;
  ProtocolHistory.create = async () => ({ ok: true });
  Protocol.findById = () => ({
    populate() { return this; },
    then(resolve) { return Promise.resolve(resolve(created)); }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ title: "Chamado", type: "solicitacao", priority: "medium" })
    });
    assert.equal(response.status, 201);
  });

  assert.ok(published.includes("protocol.created"));
});

test("API /api/system/events lista eventos do tenant", async () => {
  OsEventLog.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return 2;
  };
  OsEventLog.find = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean: async () => ([
        { _id: "1", tenantId, eventName: "associate.created", module: "associates", action: "created", occurredAt: new Date().toISOString(), failed: 0 },
        { _id: "2", tenantId, eventName: "project.created", module: "projects", action: "created", occurredAt: new Date().toISOString(), failed: 0 }
      ])
    };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/events?limit=10", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.total, 2);
    assert.equal(body.items.length, 2);
  });
});

test("API /api/system/events/dashboard retorna agregados", async () => {
  OsEventLog.countDocuments = async (filter) => {
    if (filter.failed && filter.failed.$gt === 0) return 1;
    if (filter.occurredAt && filter.occurredAt.$gte) return 3;
    return 9;
  };
  OsEventLog.aggregate = async (pipeline) => {
    const groupBy = pipeline[1]?.$group?._id;
    if (groupBy === "$module") {
      return [{ _id: "projects", total: 4 }, { _id: "associates", total: 2 }];
    }
    return [{ _id: "project.created", total: 4 }, { _id: "associate.created", total: 2 }];
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/events/dashboard", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.totalEvents, 9);
    assert.equal(body.todayEvents, 3);
    assert.equal(body.failedEvents, 1);
    assert.equal(body.byModule[0].module, "projects");
    assert.equal(body.byEventName[0].eventName, "project.created");
  });
});
