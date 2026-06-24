const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Asset = require("../src/models/Asset");
const AssetHistory = require("../src/models/AssetHistory");
const Project = require("../src/models/Project");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const assetId = "507f1f77bcf86cd799439081";
const projectId = "507f1f77bcf86cd799439071";

const originals = {
  assetCreate: Asset.create,
  assetFind: Asset.find,
  assetFindOne: Asset.findOne,
  assetFindById: Asset.findById,
  assetDeleteOne: Asset.deleteOne,
  historyCreate: AssetHistory.create,
  historyFind: AssetHistory.find,
  projectFindOne: Project.findOne
};

afterEach(() => {
  Asset.create = originals.assetCreate;
  Asset.find = originals.assetFind;
  Asset.findOne = originals.assetFindOne;
  Asset.findById = originals.assetFindById;
  Asset.deleteOne = originals.assetDeleteOne;
  AssetHistory.create = originals.historyCreate;
  AssetHistory.find = originals.historyFind;
  Project.findOne = originals.projectFindOne;
  delete require.cache[require.resolve("../src/modules/assets/assets.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId, enabledModules = ["core", "financial", "assets"]) {
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

function populateValue(value) {
  return { populate: async () => value };
}

function assetDoc(overrides = {}) {
  return {
    _id: assetId,
    tenantId,
    projectId: { _id: projectId, name: "Instalação CFTV Fazenda Boa Vista", status: "active" },
    assetCode: "AST-000006",
    name: "Câmera 01",
    category: "camera",
    description: "Câmera IP",
    serialNumber: "SER-001",
    acquisitionDate: new Date("2026-06-01T00:00:00.000Z"),
    acquisitionValue: 1200,
    currentValue: 1150,
    supplier: "Intelbras",
    responsibleName: "Carlos",
    location: "Galpão",
    status: "active",
    notes: "Instalada no portão",
    qrCode: JSON.stringify({ code: "AST-000006", tenantId, assetId }),
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      this.updatedAt = new Date("2026-06-24T12:00:00.000Z");
      return this;
    },
    ...overrides
  };
}

test("POST /api/assets cria ativo com código patrimonial, QR e projeto do tenant", async () => {
  const created = assetDoc({ qrCode: "" });
  const historyCalls = [];
  let createPayload;

  Asset.findOne = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return {
      sort(sortValue) {
        assert.deepEqual(sortValue, { assetCode: -1 });
        return {
          select(field) {
            assert.equal(field, "assetCode");
            return lean({ assetCode: "AST-000005" });
          }
        };
      }
    };
  };

  Project.findOne = (filter) => {
    assert.equal(String(filter._id), projectId);
    assert.equal(String(filter.tenantId), tenantId);
    return {
      select(field) {
        assert.equal(field, "name status");
        return lean({ _id: projectId, name: "Instalação CFTV Fazenda Boa Vista", status: "active" });
      }
    };
  };

  Asset.create = async (payload) => {
    createPayload = payload;
    Object.assign(created, payload, { assetCode: "AST-000006", qrCode: "" });
    return created;
  };

  Asset.findById = (id) => {
    assert.equal(String(id), assetId);
    return populateValue(created);
  };

  AssetHistory.create = async (payload) => {
    historyCalls.push(payload);
    return payload;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        projectId,
        name: "Câmera 01",
        category: "camera",
        serialNumber: "SER-001",
        supplier: "Intelbras",
        acquisitionValue: 1200,
        currentValue: 1150,
        responsibleName: "Carlos",
        location: "Galpão",
        notes: "Instalada no portão"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.asset.assetCode, "AST-000006");
    assert.equal(body.asset.projectId, projectId);
    assert.equal(body.asset.projectName, "Instalação CFTV Fazenda Boa Vista");
    assert.equal(body.asset.name, "Câmera 01");
    assert.ok(body.asset.qrCode.includes("AST-000006"));
  });

  assert.equal(String(createPayload.tenantId), tenantId);
  assert.equal(createPayload.assetCode, "AST-000006");
  assert.equal(created.saveCalls, 1);
  assert.ok(created.qrCode.includes("AST-000006"));
  assert.equal(historyCalls.length, 1);
  assert.equal(historyCalls[0].action, "criacao");
});

test("GET /api/assets e GET /api/assets/:id respeitam tenant, projeto e histórico", async () => {
  const doc = assetDoc();
  const historyRows = [
    { _id: "507f1f77bcf86cd799439091", assetId, tenantId, action: "criacao", user: { email: "owner@nexora.test", role: "owner" }, date: new Date("2026-06-24T10:00:00.000Z"), notes: "Criado" },
    { _id: "507f1f77bcf86cd799439092", assetId, tenantId, action: "manutencao", user: { email: "owner@nexora.test", role: "owner" }, date: new Date("2026-06-25T10:00:00.000Z"), notes: "Ajuste" }
  ];

  Asset.find = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    assert.equal(filter.category, "camera");
    return {
      populate(field) {
        assert.equal(field, "projectId");
        return {
          sort(sortValue) {
            assert.deepEqual(sortValue, { createdAt: -1 });
            return {
              limit(limitValue) {
                assert.equal(limitValue, 300);
                return lean([doc]);
              }
            };
          }
        };
      }
    };
  };

  Asset.findOne = async (filter) => {
    assert.equal(String(filter._id), assetId);
    assert.equal(String(filter.tenantId), tenantId);
    return {
      ...doc,
      populate: async () => doc
    };
  };

  AssetHistory.find = (filter) => {
    assert.equal(String(filter.assetId), assetId);
    assert.equal(String(filter.tenantId), tenantId);
    return {
      sort(sortValue) {
        assert.deepEqual(sortValue, { date: -1, createdAt: -1 });
        return lean(historyRows);
      }
    };
  };

  await withServer(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/assets?category=camera&q=Camera`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listBody.assets.length, 1);
    assert.equal(listBody.assets[0].projectName, "Instalação CFTV Fazenda Boa Vista");

    const detailResponse = await fetch(`${baseUrl}/api/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const detailBody = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.asset.assetCode, "AST-000006");
    assert.equal(detailBody.history.length, 2);
    assert.equal(detailBody.history[0].action, "criacao");
  });
});

test("PUT e ações de manutenção, venda, baixa e exclusão registram histórico", async () => {
  const doc = assetDoc();
  const historyCalls = [];
  let deleteFilter;
  let projectChecks = 0;

  Project.findOne = () => {
    projectChecks += 1;
    return { select: () => lean({ _id: projectId, name: "Instalação CFTV Fazenda Boa Vista", status: "active" }) };
  };

  Asset.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return {
      ...doc,
      populate: async () => doc
    };
  };

  AssetHistory.create = async (payload) => {
    historyCalls.push(payload.action);
    return payload;
  };

  Asset.deleteOne = async (filter) => {
    deleteFilter = filter;
    return { acknowledged: true, deletedCount: 1 };
  };

  await withServer(async (baseUrl) => {
    const putResponse = await fetch(`${baseUrl}/api/assets/${assetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ projectId, name: "Câmera 02", category: "camera", currentValue: 1100, historyNotes: "Troca de posição" })
    });
    assert.equal(putResponse.status, 200);
    assert.equal(doc.name, "Câmera 02");

    const maintenanceResponse = await fetch(`${baseUrl}/api/assets/${assetId}/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ notes: "Enviado para ajuste" })
    });
    assert.equal(maintenanceResponse.status, 200);
    assert.equal(doc.status, "maintenance");

    const sellResponse = await fetch(`${baseUrl}/api/assets/${assetId}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ currentValue: 900, notes: "Venda para terceiro" })
    });
    assert.equal(sellResponse.status, 200);
    assert.equal(doc.status, "sold");

    const retireResponse = await fetch(`${baseUrl}/api/assets/${assetId}/retire`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ notes: "Obsoleto" })
    });
    assert.equal(retireResponse.status, 200);
    assert.equal(doc.status, "retired");

    const deleteResponse = await fetch(`${baseUrl}/api/assets/${assetId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ notes: "Remoção definitiva" })
    });
    assert.equal(deleteResponse.status, 200);
  });

  assert.equal(projectChecks, 1);
  assert.deepEqual(historyCalls, ["edicao", "manutencao", "venda", "baixa", "exclusao"]);
  assert.equal(String(deleteFilter._id), assetId);
  assert.equal(String(deleteFilter.tenantId), tenantId);
});

test("GET /api/assets/dashboard e /api/assets/report retornam indicadores patrimoniais", async () => {
  const rows = [
    assetDoc({ _id: "507f1f77bcf86cd799439081", status: "active", acquisitionValue: 1200, currentValue: 1100 }),
    assetDoc({ _id: "507f1f77bcf86cd799439082", status: "maintenance", acquisitionValue: 800, currentValue: 650 }),
    assetDoc({ _id: "507f1f77bcf86cd799439083", status: "retired", acquisitionValue: 500, currentValue: 100 })
  ];
  let listCalls = 0;

  Asset.find = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    listCalls += 1;
    if (listCalls === 1) return lean(rows);
    return {
      populate(field) {
        assert.equal(field, "projectId");
        return {
          sort(sortValue) {
            assert.deepEqual(sortValue, { createdAt: -1 });
            return lean(rows);
          }
        };
      }
    };
  };

  await withServer(async (baseUrl) => {
    const dashboardResponse = await fetch(`${baseUrl}/api/assets/dashboard`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const dashboardBody = await dashboardResponse.json();
    assert.equal(dashboardResponse.status, 200);
    assert.deepEqual(dashboardBody, {
      ok: true,
      totalAssets: 3,
      activeAssets: 1,
      maintenanceAssets: 1,
      retiredAssets: 1,
      totalAcquisitionValue: 2500,
      totalCurrentValue: 1850
    });

    const reportResponse = await fetch(`${baseUrl}/api/assets/report`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const reportBody = await reportResponse.json();
    assert.equal(reportResponse.status, 200);
    assert.equal(reportBody.summary.totalAssets, 3);
    assert.equal(reportBody.summary.activeAssets, 1);
    assert.equal(reportBody.summary.maintenanceAssets, 1);
    assert.equal(reportBody.summary.retiredAssets, 1);
    assert.equal(reportBody.summary.totalAcquisitionValue, 2500);
    assert.equal(reportBody.summary.totalCurrentValue, 1850);
    assert.equal(reportBody.assets.length, 3);
  });
});

test("rotas de patrimônio isolam tenant e retornam 404 para ativo externo", async () => {
  Asset.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), otherTenantId);
    assert.equal(String(filter._id), assetId);
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${authToken(otherTenantId)}` }
    });
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

test("módulo assets bloqueia acesso quando não contratado", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets`, {
      headers: { Authorization: `Bearer ${authToken(tenantId, ["core", "financial"])}` }
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.message, "Módulo não contratado.");
  });
});
