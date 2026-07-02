const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const AgentExecutionLog = require("../src/models/AgentExecutionLog");
const AiConversation = require("../src/models/AiConversation");
const Associate = require("../src/models/Associate");
const Asset = require("../src/models/Asset");
const FinancialTransaction = require("../src/models/FinancialTransaction");
const Invoice = require("../src/models/Invoice");
const Notification = require("../src/models/Notification");
const Project = require("../src/models/Project");
const Protocol = require("../src/models/Protocol");
const Tenant = require("../src/models/Tenant");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  agentCreate: AgentExecutionLog.create,
  agentFind: AgentExecutionLog.find,
  aiFindOneAndUpdate: AiConversation.findOneAndUpdate,
  associateCountDocuments: Associate.countDocuments,
  assetAggregate: Asset.aggregate,
  assetCountDocuments: Asset.countDocuments,
  assetFind: Asset.find,
  financialAggregate: FinancialTransaction.aggregate,
  invoiceAggregate: Invoice.aggregate,
  invoiceFind: Invoice.find,
  notificationCountDocuments: Notification.countDocuments,
  projectCountDocuments: Project.countDocuments,
  projectFind: Project.find,
  protocolCountDocuments: Protocol.countDocuments,
  protocolFind: Protocol.find,
  tenantFindById: Tenant.findById
};

afterEach(() => {
  Object.assign(AgentExecutionLog, { create: originals.agentCreate, find: originals.agentFind });
  AiConversation.findOneAndUpdate = originals.aiFindOneAndUpdate;
  Associate.countDocuments = originals.associateCountDocuments;
  Asset.aggregate = originals.assetAggregate;
  Asset.countDocuments = originals.assetCountDocuments;
  Asset.find = originals.assetFind;
  FinancialTransaction.aggregate = originals.financialAggregate;
  Invoice.aggregate = originals.invoiceAggregate;
  Invoice.find = originals.invoiceFind;
  Notification.countDocuments = originals.notificationCountDocuments;
  Project.countDocuments = originals.projectCountDocuments;
  Project.find = originals.projectFind;
  Protocol.countDocuments = originals.protocolCountDocuments;
  Protocol.find = originals.protocolFind;
  Tenant.findById = originals.tenantFindById;
  for (const key of Object.keys(require.cache)) {
    if (key.includes("/src/agents/") || key.endsWith("/src/app.js") || key.includes("/src/modules/agents/") || key.includes("/src/modules/ai/")) {
      delete require.cache[key];
    }
  }
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

function findChain(value) {
  return {
    sort() { return this; },
    limit() { return this; },
    lean: async () => value
  };
}

function stubTenant(enabledModules = []) {
  Tenant.findById = () => ({
    select() {
      return { lean: async () => ({ _id: tenantId, enabledModules }) };
    }
  });
}

function stubLogs() {
  const logs = [];
  AgentExecutionLog.create = async (payload) => {
    logs.push({ ...payload, createdAt: new Date() });
    return logs[logs.length - 1];
  };
  AgentExecutionLog.find = (filter) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => logs.filter((item) => String(item.tenantId) === String(filter.tenantId) && (!filter.agentId || item.agentId === filter.agentId))
  });
  return logs;
}

function stubConversation() {
  AiConversation.findOneAndUpdate = async (_filter, update) => ({
    conversationId: update.$setOnInsert.conversationId,
    tenantId: update.$setOnInsert.tenantId,
    userId: update.$setOnInsert.userId,
    messages: [],
    execution: {},
    status: "open",
    save: async function save() { return this; }
  });
}

function stubExecutiveModels(expectedTenantId = tenantId, expectedUserId = userId) {
  FinancialTransaction.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.tenantId), expectedTenantId);
    const match = pipeline[0].$match;
    if (match.type === "income" && match.paidAt) return [{ total: 300 }];
    if (match.type === "expense" && match.paidAt) return [{ total: 125 }];
    if (match.type === "income") return [{ total: 1000 }];
    if (match.type === "expense") return [{ total: 275 }];
    return [{ total: 0 }];
  };
  Invoice.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.tenantId), expectedTenantId);
    return [{ total: 80, count: 2 }];
  };
  Protocol.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return filter.priority === "urgent" ? 1 : 4;
  };
  Protocol.find = (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ title: "SLA vencido", status: "open" }]);
  };
  Project.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return filter.endDate ? 1 : 3;
  };
  Project.find = (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ name: "Reforma", status: "active", endDate: new Date("2026-06-01T00:00:00.000Z") }]);
  };
  Asset.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return 7;
  };
  Asset.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.tenantId), expectedTenantId);
    return [{ total: 9000 }];
  };
  Asset.find = (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ name: "Roteador", assetCode: "AST-1", status: "maintenance" }]);
  };
  Invoice.find = (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ description: "Mensalidade", amountCurrent: 80, status: "overdue" }]);
  };
  Notification.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    if (filter.userId) assert.equal(String(filter.userId), expectedUserId);
    return filter.severity === "critical" ? 2 : 5;
  };
  Associate.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    return 12;
  };
}

test("agent registry registra agentes padrão e seleciona melhor agente", () => {
  const registry = require("../src/agents/agentRegistry");
  assert.deepEqual(registry.getAllAgents().map((agent) => agent.id), ["finance", "projects", "assets", "protocols", "workflow", "bi", "notifications", "subscription", "scheduler"]);
  assert.equal(registry.findBestAgent("Quais patrimônios estão em manutenção?").id, "assets");
  assert.equal(registry.findByCapability("saldo")[0].id, "finance");
});

test("supervisor usa agente específico, cria log e respeita tenant", async () => {
  stubTenant(["financial", "assets", "projects", "protocols"]);
  const logs = stubLogs();
  stubExecutiveModels(otherTenantId);
  const { supervisor } = require("../src/agents");

  const result = await supervisor.execute("Qual meu saldo?", { tenantId: otherTenantId, userId });

  assert.equal(result.supervisor, true);
  assert.deepEqual(result.agentsUsed, ["finance"]);
  assert.match(result.answer, /saldo/i);
  assert.equal(logs.length, 1);
  assert.equal(String(logs[0].tenantId), otherTenantId);
});

test("supervisor usa múltiplos agentes para pergunta ampla", async () => {
  stubTenant(["financial", "assets", "projects", "protocols"]);
  stubLogs();
  stubExecutiveModels();
  const { supervisor } = require("../src/agents");

  const result = await supervisor.execute("Como está minha empresa?", { tenantId, userId });

  assert.deepEqual(result.agentsUsed, ["finance", "projects", "assets", "protocols", "bi", "notifications"]);
  assert.match(result.answer, /Financeiro/i);
});

test("falha de um agente não quebra resposta consolidada", async () => {
  stubTenant(["financial", "assets"]);
  stubLogs();
  stubExecutiveModels();
  const { registry, supervisor } = require("../src/agents");
  registry.register({ id: "broken", name: "Broken", module: "core", enabled: true, capabilities: ["quebrar"], getStatus: () => ({ id: "broken" }), canHandle: () => true, execute: async () => { throw new Error("falha prevista"); } });

  const result = await supervisor.executeMany(["finance", "broken"], "quebrar", { tenantId, userId });

  assert.equal(result.ok, true);
  assert.deepEqual(result.agentsUsed, ["finance", "broken"]);
  assert.equal(result.failures[0].agentId, "broken");
  assert.match(result.answer, /Financeiro/i);
});

test("/api/agents endpoints retornam lista, status, detalhes, supervisor e logs tenant-safe", async () => {
  stubTenant(["financial", "assets", "projects", "protocols"]);
  stubExecutiveModels();
  stubLogs();

  await withServer(async (baseUrl) => {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + authToken() };
    const list = await fetch(baseUrl + "/api/agents", { headers }).then((res) => res.json());
    const status = await fetch(baseUrl + "/api/agents/status", { headers }).then((res) => res.json());
    const detail = await fetch(baseUrl + "/api/agents/finance", { headers }).then((res) => res.json());
    const supervisor = await fetch(baseUrl + "/api/agents/supervisor", { method: "POST", headers, body: JSON.stringify({ question: "Qual meu saldo?" }) }).then((res) => res.json());
    const testResult = await fetch(baseUrl + "/api/agents/test", { method: "POST", headers, body: JSON.stringify({ question: "Como está minha empresa?" }) }).then((res) => res.json());
    const logs = await fetch(baseUrl + "/api/agents/logs", { headers }).then((res) => res.json());

    assert.equal(list.agents.length, 9);
    assert.equal(status.supervisor.status, "online");
    assert.equal(detail.agent.id, "finance");
    assert.deepEqual(supervisor.agentsUsed, ["finance"]);
    assert.ok(testResult.agentsUsed.length > 1);
    assert.ok(logs.logs.every((item) => String(item.tenantId) === tenantId));
  });
});

test("/api/ai/assistant/message retorna agentsUsed quando supervisor atende", async () => {
  stubTenant(["financial", "assets", "projects", "protocols"]);
  stubExecutiveModels();
  stubLogs();
  stubConversation();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/assistant/message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ message: "Quais patrimônios estão em manutenção?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.supervisor, true);
    assert.deepEqual(body.agentsUsed, ["assets"]);
    assert.match(body.answer, /Patrimônios em manutenção/i);
  });
});
