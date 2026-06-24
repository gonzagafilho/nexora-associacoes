const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Protocol = require("../src/models/Protocol");
const ProtocolHistory = require("../src/models/ProtocolHistory");
const Project = require("../src/models/Project");
const Asset = require("../src/models/Asset");
const Associate = require("../src/models/Associate");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const protocolId = "507f1f77bcf86cd799439181";
const projectId = "507f1f77bcf86cd799439071";
const assetId = "507f1f77bcf86cd799439081";
const associateId = "507f1f77bcf86cd799439061";

const originals = {
  protocolCreate: Protocol.create,
  protocolFind: Protocol.find,
  protocolFindOne: Protocol.findOne,
  protocolFindById: Protocol.findById,
  historyCreate: ProtocolHistory.create,
  historyFind: ProtocolHistory.find,
  projectFindOne: Project.findOne,
  assetFindOne: Asset.findOne,
  associateFindOne: Associate.findOne
};

afterEach(() => {
  Protocol.create = originals.protocolCreate;
  Protocol.find = originals.protocolFind;
  Protocol.findOne = originals.protocolFindOne;
  Protocol.findById = originals.protocolFindById;
  ProtocolHistory.create = originals.historyCreate;
  ProtocolHistory.find = originals.historyFind;
  Project.findOne = originals.projectFindOne;
  Asset.findOne = originals.assetFindOne;
  Associate.findOne = originals.associateFindOne;
  delete require.cache[require.resolve("../src/modules/protocols/protocols.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId, enabledModules = ["core", "financial", "protocols"]) {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role: "owner", email: "owner@nexora.test", enabledModules },
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

function lean(value) {
  return { lean: async () => value };
}

function protocolQuery(value) {
  return {
    populate() { return this; },
    lean: async () => value
  };
}

function protocolDoc(overrides = {}) {
  return {
    _id: protocolId,
    tenantId,
    protocolNumber: "PROTO-000006",
    title: "Solicitação de manutenção do portão",
    description: "Portão travando na abertura.",
    type: "manutencao",
    priority: "urgent",
    status: "open",
    requesterName: "João da Portaria",
    requesterContact: "11999998888",
    assignedToName: "Equipe Técnica",
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    resolvedAt: null,
    closedAt: null,
    relatedProjectId: { _id: projectId, name: "Reforma da guarita" },
    relatedAssetId: { _id: assetId, name: "Portão eletrônico", assetCode: "AST-000020" },
    relatedAssociateId: { _id: associateId, name: "Maria Souza" },
    notes: "Atender com urgência.",
    createdBy: userId,
    createdAt: new Date("2026-06-18T10:00:00.000Z"),
    updatedAt: new Date("2026-06-18T10:00:00.000Z"),
    saveCalls: 0,
    async populate() { return this; },
    async save() {
      this.saveCalls += 1;
      this.updatedAt = new Date("2026-06-24T12:00:00.000Z");
      return this;
    },
    ...overrides
  };
}

test("POST /api/protocols cria protocolo com número por tenant e vínculos relacionados", async () => {
  const created = protocolDoc({ protocolNumber: "PROTO-000010", resolvedAt: undefined, closedAt: undefined });
  const historyCalls = [];
  let createPayload;
  const tenantChecks = [];

  Protocol.findOne = (filter) => {
    tenantChecks.push(String(filter.tenantId));
    return {
      sort(sortValue) {
        assert.deepEqual(sortValue, { protocolNumber: -1 });
        return {
          select(field) {
            assert.equal(field, "protocolNumber");
            return lean({ protocolNumber: "PROTO-000009" });
          }
        };
      }
    };
  };

  Project.findOne = (filter) => {
    assert.equal(String(filter._id), projectId);
    assert.equal(String(filter.tenantId), tenantId);
    return { select: () => lean({ _id: projectId, name: "Reforma da guarita" }) };
  };
  Asset.findOne = (filter) => {
    assert.equal(String(filter._id), assetId);
    assert.equal(String(filter.tenantId), tenantId);
    return { select: () => lean({ _id: assetId, name: "Portão eletrônico", assetCode: "AST-000020" }) };
  };
  Associate.findOne = (filter) => {
    assert.equal(String(filter._id), associateId);
    assert.equal(String(filter.tenantId), tenantId);
    return { select: () => lean({ _id: associateId, name: "Maria Souza" }) };
  };
  Protocol.create = async (payload) => {
    createPayload = payload;
    Object.assign(created, payload);
    return created;
  };
  Protocol.findById = (id) => {
    assert.equal(String(id), protocolId);
    return { populate() { return this; }, then(resolve) { return Promise.resolve(resolve(created)); } };
  };
  ProtocolHistory.create = async (payload) => {
    historyCalls.push(payload);
    return payload;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/protocols`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        title: "Solicitação de manutenção do portão",
        description: "Portão travando na abertura.",
        type: "manutencao",
        priority: "urgent",
        requesterName: "João da Portaria",
        requesterContact: "11999998888",
        assignedToName: "Equipe Técnica",
        dueDate: "2026-06-20",
        relatedProjectId: projectId,
        relatedAssetId: assetId,
        relatedAssociateId: associateId,
        notes: "Atender com urgência."
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.protocol.protocolNumber, "PROTO-000010");
    assert.equal(body.protocol.relatedProjectName, "Reforma da guarita");
    assert.equal(body.protocol.relatedAssetCode, "AST-000020");
    assert.equal(body.protocol.relatedAssociateName, "Maria Souza");
  });

  assert.deepEqual(tenantChecks, [tenantId]);
  assert.equal(String(createPayload.tenantId), tenantId);
  assert.equal(createPayload.protocolNumber, "PROTO-000010");
  assert.equal(historyCalls.length, 1);
  assert.equal(historyCalls[0].action, "criacao");
  assert.equal(historyCalls[0].newStatus, "open");
});

test("GET /api/protocols filtra, ordena e expõe dashboard e histórico", async () => {
  const urgent = protocolDoc({ _id: protocolId, protocolNumber: "PROTO-000006", createdAt: new Date("2026-06-18T10:00:00.000Z") });
  const waiting = protocolDoc({
    _id: "507f1f77bcf86cd799439182",
    protocolNumber: "PROTO-000007",
    title: "Documento pendente",
    type: "documento",
    priority: "medium",
    status: "waiting",
    dueDate: new Date("2026-06-26T00:00:00.000Z"),
    createdAt: new Date("2026-06-19T10:00:00.000Z")
  });
  const resolved = protocolDoc({
    _id: "507f1f77bcf86cd799439183",
    protocolNumber: "PROTO-000008",
    title: "Financeiro conciliado",
    type: "financeiro",
    priority: "high",
    status: "resolved",
    dueDate: new Date("2026-06-15T00:00:00.000Z"),
    createdAt: new Date("2026-06-20T10:00:00.000Z")
  });
  const historyRows = [
    { _id: "507f1f77bcf86cd799439191", protocolId, tenantId, action: "criacao", oldStatus: "", newStatus: "open", message: "Criado", userId, userEmail: "owner@nexora.test", createdAt: new Date("2026-06-18T10:00:00.000Z") },
    { _id: "507f1f77bcf86cd799439192", protocolId, tenantId, action: "mudanca_status", oldStatus: "open", newStatus: "in_progress", message: "Encaminhado", userId, userEmail: "owner@nexora.test", createdAt: new Date("2026-06-18T11:00:00.000Z") }
  ];

  Protocol.find = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    if (filter.status) assert.equal(filter.status, "open");
    if (filter.priority) assert.equal(filter.priority, "urgent");
    if (filter.type) assert.equal(filter.type, "manutencao");
    if (filter.createdAt) {
      assert.ok(filter.createdAt.$gte);
      assert.ok(filter.createdAt.$lte);
    }
    if (filter.$or) assert.equal(filter.$or.length, 7);
    return protocolQuery([waiting, urgent, resolved]);
  };
  Protocol.findOne = async (filter) => {
    assert.equal(String(filter._id), protocolId);
    assert.equal(String(filter.tenantId), tenantId);
    return protocolDoc();
  };
  ProtocolHistory.find = (filter) => {
    assert.equal(String(filter.protocolId), protocolId);
    assert.equal(String(filter.tenantId), tenantId);
    return { sort(sortValue) { assert.deepEqual(sortValue, { createdAt: -1 }); return lean(historyRows); } };
  };

  await withServer(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/protocols?status=open&priority=urgent&type=manutencao&q=portao&dateFrom=2026-06-01&dateTo=2026-06-30&page=1&limit=2`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listBody.protocols.length, 2);
    assert.equal(listBody.protocols[0].protocolNumber, "PROTO-000006");
    assert.equal(listBody.protocols[1].protocolNumber, "PROTO-000008");
    assert.equal(listBody.pagination.total, 3);

    Protocol.find = () => lean([urgent, waiting, resolved]);
    const dashboardResponse = await fetch(`${baseUrl}/api/protocols/dashboard`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const dashboardBody = await dashboardResponse.json();
    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboardBody.totalProtocols, 3);
    assert.equal(dashboardBody.openProtocols, 1);
    assert.equal(dashboardBody.waitingProtocols, 1);
    assert.equal(dashboardBody.resolvedProtocols, 1);
    assert.equal(dashboardBody.urgentProtocols, 1);
    assert.equal(dashboardBody.overdueProtocols, 1);

    const historyResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}/history`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const historyBody = await historyResponse.json();
    assert.equal(historyResponse.status, 200);
    assert.equal(historyBody.history.length, 2);
    assert.equal(historyBody.history[0].action, "criacao");
  });
});

test("PUT e ações de status resolvem, fecham e cancelam com histórico", async () => {
  const doc = protocolDoc();
  const historyActions = [];
  let relatedChecks = 0;

  Protocol.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return doc;
  };
  Project.findOne = () => { relatedChecks += 1; return { select: () => lean({ _id: projectId, name: "Reforma da guarita" }) }; };
  Asset.findOne = () => { relatedChecks += 1; return { select: () => lean({ _id: assetId, name: "Portão eletrônico", assetCode: "AST-000020" }) }; };
  Associate.findOne = () => { relatedChecks += 1; return { select: () => lean({ _id: associateId, name: "Maria Souza" }) }; };
  ProtocolHistory.create = async (payload) => { historyActions.push(payload.action); return payload; };

  await withServer(async (baseUrl) => {
    const putResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ title: "Solicitação ajustada", type: "manutencao", priority: "high", status: "in_progress", relatedProjectId: projectId, relatedAssetId: assetId, relatedAssociateId: associateId, notes: "Em atendimento" })
    });
    assert.equal(putResponse.status, 200);
    assert.equal(doc.title, "Solicitação ajustada");
    assert.equal(doc.status, "in_progress");

    const statusResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ status: "waiting", message: "Aguardando fornecedor" })
    });
    assert.equal(statusResponse.status, 200);
    assert.equal(doc.status, "waiting");

    const resolveResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ message: "Problema resolvido" })
    });
    assert.equal(resolveResponse.status, 200);
    assert.equal(doc.status, "resolved");
    assert.ok(doc.resolvedAt);

    const closeResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ message: "Encerrado" })
    });
    assert.equal(closeResponse.status, 200);
    assert.equal(doc.status, "closed");
    assert.ok(doc.closedAt);

    const cancelResponse = await fetch(`${baseUrl}/api/protocols/${protocolId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ message: "Cancelado pelo solicitante" })
    });
    assert.equal(cancelResponse.status, 200);
    assert.equal(doc.status, "cancelled");
  });

  assert.equal(relatedChecks, 3);
  assert.deepEqual(historyActions, ["mudanca_status", "mudanca_status", "resolucao", "fechamento", "cancelamento"]);
});

test("Protocolos respeitam isolamento multi-tenant", async () => {
  Protocol.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), otherTenantId);
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/protocols/${protocolId}`, {
      headers: { Authorization: `Bearer ${authToken(otherTenantId)}` }
    });
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.message, "Protocolo não encontrado.");
  });
});

test("requireModule bloqueia tenant sem módulo protocols", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/protocols/dashboard`, {
      headers: { Authorization: `Bearer ${authToken(tenantId, ["core", "financial"])}` }
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.match(body.message, /Módulo não contratado/i);
  });
});