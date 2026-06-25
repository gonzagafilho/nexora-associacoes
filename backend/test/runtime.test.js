const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const runtime = require("../src/runtime/runtime");
const runtimeCache = require("../src/runtime/runtimeCache");
const runtimeMetrics = require("../src/runtime/runtimeMetrics");
const runtimeSessions = require("../src/runtime/runtimeSessionManager");
const runtimeRegistry = require("../src/runtime/runtimeServiceRegistry");
const { sanitizeContext } = require("../src/runtime/runtimeContext");
const Workflow = require("../src/workflow/models/Workflow");
const WorkflowExecution = require("../src/workflow/models/WorkflowExecution");
const OsEventLog = require("../src/models/OsEventLog");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

const originals = {
  workflowCountDocuments: Workflow.countDocuments,
  executionAggregate: WorkflowExecution.aggregate,
  executionFind: WorkflowExecution.find,
  osEventCountDocuments: OsEventLog.countDocuments,
  osEventAggregate: OsEventLog.aggregate,
  osEventFind: OsEventLog.find,
  runtimePublish: runtime.publish
};

afterEach(() => {
  Workflow.countDocuments = originals.workflowCountDocuments;
  WorkflowExecution.aggregate = originals.executionAggregate;
  WorkflowExecution.find = originals.executionFind;
  OsEventLog.countDocuments = originals.osEventCountDocuments;
  OsEventLog.aggregate = originals.osEventAggregate;
  OsEventLog.find = originals.osEventFind;
  runtime.publish = originals.runtimePublish;
  runtimeCache.clear();
  runtimeMetrics.resetForTest();
  delete require.cache[require.resolve("../src/runtime/runtime")];
  delete require.cache[require.resolve("../src/runtime/runtimeInspectorService")];
  delete require.cache[require.resolve("../src/runtime/runtimeHealthService")];
  delete require.cache[require.resolve("../src/services/intelligence/aiAssistantService")];
  delete require.cache[require.resolve("../src/modules/system/system.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId) {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role: "owner", email: "owner@nexora.test", enabledModules: ["core", "financial"] },
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

function findChain(value) {
  return {
    sort() {
      return {
        limit() {
          return { lean: async () => value };
        },
        lean: async () => value
      };
    },
    limit() {
      return { lean: async () => value };
    },
    lean: async () => value
  };
}

function stubRuntimeCollections() {
  Workflow.countDocuments = async () => 2;
  WorkflowExecution.aggregate = async () => [{ _id: "completed", total: 3 }];
  WorkflowExecution.find = () => findChain([
    {
      _id: "507f1f77bcf86cd799439901",
      tenantId,
      workflowId: "507f1f77bcf86cd799439801",
      status: "completed",
      createdAt: new Date().toISOString(),
      duration: 120
    }
  ]);
  OsEventLog.countDocuments = async (filter) => {
    if (filter.failed?.$gt === 0) return 0;
    if (filter.occurredAt?.$gte) return 2;
    return 5;
  };
  OsEventLog.aggregate = async (pipeline) => {
    if (pipeline[1]?.$group?._id === "$module") return [{ _id: "workflow", total: 2 }];
    return [{ _id: "workflow.started", total: 2 }];
  };
  OsEventLog.find = () => findChain([
    {
      _id: "507f1f77bcf86cd799439951",
      tenantId,
      eventName: "workflow.started",
      module: "workflow",
      createdAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
      failed: 0
    }
  ]);
}

test("runtime boot retorna online", () => {
  const info = runtime.bootRuntime();
  assert.equal(info.name, "NEXORA Runtime");
  assert.equal(info.version, "1.0.0");
  assert.equal(info.status, "online");
  assert.ok(Array.isArray(info.capabilities));
  assert.ok(info.capabilities.includes("cache"));
});

test("runtime context sanitiza dados sensíveis", () => {
  const sanitized = sanitizeContext({
    tenantId,
    userId,
    authorization: "Bearer x",
    headers: { authorization: "Bearer y" },
    token: "abc",
    modules: ["financial"]
  });
  assert.equal(sanitized.authorization, undefined);
  assert.equal(sanitized.headers, undefined);
  assert.equal(sanitized.token, undefined);
  assert.equal(Array.isArray(sanitized.modules), true);
});

test("cache respeita TTL", async () => {
  runtimeCache.set("runtime.ttl", { ok: true }, 0.01);
  assert.deepEqual(runtimeCache.get("runtime.ttl"), { ok: true });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(runtimeCache.get("runtime.ttl"), null);
});

test("session manager cria e fecha sessão", () => {
  const session = runtimeSessions.createSession("workflow", { tenantId });
  assert.equal(session.status, "active");
  const closed = runtimeSessions.closeSession(session.sessionId);
  assert.equal(closed.status, "closed");
});

test("service registry registra/lista serviço", () => {
  runtimeRegistry.registerService("runtime-test-service", { ok: true }, { type: "custom", status: "online" });
  const listed = runtimeRegistry.listServices();
  assert.ok(listed.some((item) => item.name === "runtime-test-service"));
});

test("runtime publish usa Event Bus", async () => {
  let received = null;
  const unsubscribe = runtime.subscribe("runtime.test.event", ({ payload }) => {
    received = payload;
  });
  const result = await runtime.publish("runtime.test.event", { ok: true }, {});
  unsubscribe();
  assert.equal(result.eventName, "runtime.test.event");
  assert.equal(received.ok, true);
});

test("/api/system/runtime retorna 200 com auth", async () => {
  stubRuntimeCollections();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/runtime", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.runtime.name, "NEXORA Runtime");
  });
});

test("/api/system/runtime/health retorna dados", async () => {
  stubRuntimeCollections();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/runtime/health", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.runtime.status, "online");
    assert.ok(body.services.total >= 1);
  });
});

test("/api/system/runtime/inspector retorna visão executiva", async () => {
  stubRuntimeCollections();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/runtime/inspector", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "online");
    assert.ok(Array.isArray(body.services));
  });
});

test("IA responde sobre NEXORA Runtime", async () => {
  const { answerQuestion } = require("../src/services/intelligence/aiAssistantService");
  const response = await answerQuestion({ tenantId, userId, question: "o que é o NEXORA Runtime?" });
  assert.equal(response.intent, "nexora_runtime");
  assert.equal(
    response.answer,
    "O NEXORA Runtime é a camada de execução do NEXORA OS. Ele organiza contexto, cache, sessões, serviços, drivers, métricas e integração entre Kernel, Event Engine, Workflow Studio e NEXORA IA."
  );
});
