const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Associate = require("../src/models/Associate");
const Asset = require("../src/models/Asset");
const FinancialTransaction = require("../src/models/FinancialTransaction");
const Invoice = require("../src/models/Invoice");
const Notification = require("../src/models/Notification");
const OsEventLog = require("../src/models/OsEventLog");
const Project = require("../src/models/Project");
const Protocol = require("../src/models/Protocol");
const Tenant = require("../src/models/Tenant");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  associateCountDocuments: Associate.countDocuments,
  assetAggregate: Asset.aggregate,
  assetCountDocuments: Asset.countDocuments,
  assetFind: Asset.find,
  financialAggregate: FinancialTransaction.aggregate,
  invoiceAggregate: Invoice.aggregate,
  invoiceFind: Invoice.find,
  notificationCountDocuments: Notification.countDocuments,
  osEventLogCountDocuments: OsEventLog.countDocuments,
  osEventLogAggregate: OsEventLog.aggregate,
  projectCountDocuments: Project.countDocuments,
  projectFind: Project.find,
  protocolCountDocuments: Protocol.countDocuments,
  tenantFindById: Tenant.findById
};

afterEach(() => {
  Associate.countDocuments = originals.associateCountDocuments;
  Asset.aggregate = originals.assetAggregate;
  Asset.countDocuments = originals.assetCountDocuments;
  Asset.find = originals.assetFind;
  FinancialTransaction.aggregate = originals.financialAggregate;
  Invoice.aggregate = originals.invoiceAggregate;
  Invoice.find = originals.invoiceFind;
  Notification.countDocuments = originals.notificationCountDocuments;
  OsEventLog.countDocuments = originals.osEventLogCountDocuments;
  OsEventLog.aggregate = originals.osEventLogAggregate;
  Project.countDocuments = originals.projectCountDocuments;
  Project.find = originals.projectFind;
  Protocol.countDocuments = originals.protocolCountDocuments;
  Tenant.findById = originals.tenantFindById;
  delete require.cache[require.resolve("../src/services/intelligence/executiveService")];
  delete require.cache[require.resolve("../src/services/intelligence/aiAssistantService")];
  delete require.cache[require.resolve("../src/services/system/osService")];
  delete require.cache[require.resolve("../src/services/system/osEventLogService")];
  delete require.cache[require.resolve("../src/os/kernel")];
  delete require.cache[require.resolve("../src/os/driverRegistry")];
  delete require.cache[require.resolve("../src/os/eventBus")];
  delete require.cache[require.resolve("../src/os/osHealthService")];
  delete require.cache[require.resolve("../src/modules/ai/ai.routes")];
  delete require.cache[require.resolve("../src/modules/bi/bi.routes")];
  delete require.cache[require.resolve("../src/modules/system/system.routes")];
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

function findChain(value, capture = {}) {
  return {
    sort(sortValue) { capture.sort = sortValue; return this; },
    limit(limitValue) { capture.limit = limitValue; return this; },
    lean: async () => value
  };
}

function tenantString(value) {
  return String(value);
}

function stubExecutiveModels(expectedTenantId = tenantId, expectedUserId = userId) {
  const filters = [];
  FinancialTransaction.aggregate = async (pipeline) => {
    filters.push({ model: "FinancialTransaction", match: pipeline[0].$match });
    assert.equal(tenantString(pipeline[0].$match.tenantId), expectedTenantId);
    const match = pipeline[0].$match;
    if (match.type === "income" && match.paidAt) return [{ total: 300 }];
    if (match.type === "expense" && match.paidAt) return [{ total: 125 }];
    if (match.type === "income") return [{ total: 1000 }];
    if (match.type === "expense") return [{ total: 275 }];
    return [{ total: 0 }];
  };
  Invoice.aggregate = async (pipeline) => {
    filters.push({ model: "InvoiceAggregate", match: pipeline[0].$match });
    assert.equal(tenantString(pipeline[0].$match.tenantId), expectedTenantId);
    assert.deepEqual(pipeline[0].$match.status.$in, ["pending", "overdue"]);
    return [{ total: 80, count: 2 }];
  };
  Protocol.countDocuments = async (filter) => {
    filters.push({ model: "Protocol", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    assert.deepEqual(filter.status.$in, ["open", "in_progress", "waiting"]);
    return 4;
  };
  Project.countDocuments = async (filter) => {
    filters.push({ model: "ProjectCount", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    return filter.endDate ? 1 : 3;
  };
  Asset.countDocuments = async (filter) => {
    filters.push({ model: "AssetCount", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    return 7;
  };
  Asset.aggregate = async (pipeline) => {
    filters.push({ model: "AssetAggregate", match: pipeline[0].$match });
    assert.equal(tenantString(pipeline[0].$match.tenantId), expectedTenantId);
    return [{ total: 9000 }];
  };
  Notification.countDocuments = async (filter) => {
    filters.push({ model: "Notification", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    if (filter.userId) assert.equal(String(filter.userId), expectedUserId);
    return filter.severity === "critical" ? 2 : 5;
  };
  Associate.countDocuments = async (filter) => {
    filters.push({ model: "Associate", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    return 12;
  };
  Project.find = (filter) => {
    filters.push({ model: "ProjectFind", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ _id: "507f1f77bcf86cd799439071", tenantId: expectedTenantId, name: "Reforma", status: "active", endDate: new Date("2026-06-01T00:00:00.000Z") }]);
  };
  Asset.find = (filter) => {
    filters.push({ model: "AssetFind", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    assert.equal(filter.status, "maintenance");
    return findChain([{ _id: "507f1f77bcf86cd799439081", tenantId: expectedTenantId, name: "Roteador", assetCode: "AST-1", status: "maintenance" }]);
  };
  Invoice.find = (filter) => {
    filters.push({ model: "InvoiceFind", filter });
    assert.equal(String(filter.tenantId), expectedTenantId);
    return findChain([{ _id: "507f1f77bcf86cd799439091", tenantId: expectedTenantId, description: "Mensalidade", amountCurrent: 80, status: "overdue" }]);
  };
  return filters;
}

function stubOsEventsDashboard(expectedTenantId = tenantId) {
  OsEventLog.countDocuments = async (filter) => {
    assert.equal(String(filter.tenantId), expectedTenantId);
    if (filter.failed?.$gt === 0) return 1;
    if (filter.occurredAt?.$gte) return 4;
    return 10;
  };
  OsEventLog.aggregate = async (pipeline) => {
    const match = pipeline[0]?.$match || {};
    assert.equal(String(match.tenantId), expectedTenantId);
    if (pipeline[1]?.$group?._id === "$module") {
      return [{ _id: "projects", total: 5 }, { _id: "financial", total: 3 }];
    }
    return [{ _id: "project.created", total: 5 }, { _id: "financial.transaction.created", total: 3 }];
  };
}

function stubSystemOsTenant(enabledModules = ["financial", "projects", "protocols"]) {
  Tenant.findById = () => ({
    select() {
      return {
        lean: async () => ({ _id: tenantId, enabledModules })
      };
    }
  });
}

test("GET /api/bi/executive retorna dados do tenant", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/bi/executive", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.receitaMes, 300);
    assert.equal(body.data.despesaMes, 125);
    assert.equal(body.data.saldo, 725);
    assert.equal(body.data.inadimplencia.total, 80);
    assert.equal(body.data.protocolosAbertos, 4);
    assert.equal(body.data.projetosAtivos, 3);
    assert.equal(body.data.projetosAtrasados, 1);
    assert.equal(body.data.patrimonioTotal.count, 7);
    assert.equal(body.data.patrimonioTotal.value, 9000);
    assert.equal(body.data.alertasCriticos, 2);
    assert.equal(body.data.notificacoesNaoLidas, 5);
  });
});

test("POST /api/ai/chat responde saldo", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "Qual meu saldo?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.intent, "balance");
    assert.equal(body.data.saldo, 725);
    assert.match(body.answer, /saldo atual/i);
  });
});

test("POST /api/ai/chat responde protocolos abertos", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ message: "Quantos protocolos estão abertos?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "open_protocols");
    assert.equal(body.data.protocolosAbertos, 4);
    assert.match(body.answer, /4 protocolo/i);
  });
});

test("AI bloqueia tenant cruzado usando somente tenant do token", async () => {
  const filters = stubExecutiveModels(otherTenantId, userId);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken(otherTenantId) },
      body: JSON.stringify({ question: "Quais cobranças estão vencidas?", tenantId })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "overdue_invoices");
  });

  assert.ok(filters.length > 0);
  assert.ok(filters.every((entry) => {
    const filter = entry.filter || entry.match;
    return String(filter.tenantId) === otherTenantId;
  }));
});

test("POST /api/ai/chat retorna ajuda para pergunta desconhecida", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "Você pode criar uma cobrança agora?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "unknown");
    assert.match(body.answer, /Ainda não sei responder/);
    assert.ok(body.help.includes("Qual meu saldo?"));
  });
});

test("GET /api/system/os retorna NEXORA OS com módulos e capabilities", async () => {
  stubSystemOsTenant(["financial", "projects", "assets"]);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/os", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.name, "NEXORA OS");
    assert.equal(body.product, "NEXORA Gestão");
    assert.equal(body.assistant, "NEXORA IA");
    assert.equal(body.version, "3.1");
    assert.equal(body.capabilities.multiTenant, true);
    assert.equal(body.capabilities.modularBilling, true);
    assert.equal(body.capabilities.pwa, true);
    assert.equal(body.capabilities.push, true);
    assert.equal(body.capabilities.smartAlerts, true);
    assert.equal(body.capabilities.aiCopilot, true);
    assert.equal(body.capabilities.audit, true);
    assert.ok(Array.isArray(body.modules));
    assert.equal(body.modules.find((item) => item.code === "financial")?.enabled, true);
    assert.equal(body.modules.find((item) => item.code === "projects")?.enabled, true);
    assert.equal(body.modules.find((item) => item.code === "assets")?.enabled, true);
  });
});

test("GET /api/system/os respeita módulos inativos do tenant", async () => {
  stubSystemOsTenant(["financial"]);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/os", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.modules.find((item) => item.code === "financial")?.status, "active");
    assert.equal(body.modules.find((item) => item.code === "projects")?.status, "inactive");
    assert.equal(body.modules.find((item) => item.code === "protocols")?.status, "inactive");
    assert.equal(body.modules.find((item) => item.code === "aiCopilot")?.status, "active");
  });
});

test("GET /api/system/kernel retorna diagnóstico do kernel com auth", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/system/kernel", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.kernel.name, "NEXORA OS Kernel");
    assert.equal(body.kernel.status, "online");
    assert.ok(Array.isArray(body.engines));
    assert.ok(body.engines.includes("eventBus"));
    assert.equal(body.capabilities.events, true);
    assert.equal(body.health.kernel.status, "online");
    assert.ok(Array.isArray(body.reservedEvents));
    assert.ok(body.reservedEvents.includes("ai.execution"));
    assert.ok(body.drivers.payment);
  });
});

test("POST /api/ai/chat responde o que é NEXORA OS", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "O que é o NEXORA OS?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "nexora_os");
    assert.match(body.answer, /núcleo operacional/i);
  });
});

test("POST /api/ai/chat responde o que é o kernel do NEXORA OS", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "o que é o kernel do nexora os?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "nexora_kernel");
    assert.equal(body.answer, "O Kernel do NEXORA OS é o núcleo técnico da plataforma. Ele conecta eventos, permissões, auditoria, notificações, automações, workflows, drivers e a NEXORA IA, permitindo que os módulos trabalhem juntos com segurança.");
  });
});

test("POST /api/ai/chat responde o que é o Event Engine", async () => {
  stubExecutiveModels();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "o que é o event engine?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "event_engine");
    assert.equal(body.answer, "O Event Engine do NEXORA OS é o barramento interno que registra e distribui eventos entre os módulos da plataforma, permitindo automações, auditoria, notificações e integrações sem acoplamento direto entre os módulos.");
  });
});

test("POST /api/ai/chat responde eventos de hoje", async () => {
  stubExecutiveModels();
  stubOsEventsDashboard();

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ question: "quais eventos aconteceram hoje?" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.intent, "events_today");
    assert.equal(body.data.todayEvents, 4);
    assert.match(body.answer, /Hoje foram registrados 4 evento\(s\)/i);
  });
});
