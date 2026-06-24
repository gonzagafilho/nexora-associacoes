const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Project = require("../src/models/Project");
const FinancialTransaction = require("../src/models/FinancialTransaction");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const projectId = "507f1f77bcf86cd799439071";
const transactionId = "507f1f77bcf86cd799439041";

const originals = {
  projectCreate: Project.create,
  projectFind: Project.find,
  projectFindOne: Project.findOne,
  projectFindOneAndUpdate: Project.findOneAndUpdate,
  projectFindOneAndDelete: Project.findOneAndDelete,
  transactionFind: FinancialTransaction.find,
  transactionCreate: FinancialTransaction.create,
  transactionUpdateMany: FinancialTransaction.updateMany
};

afterEach(() => {
  Project.create = originals.projectCreate;
  Project.find = originals.projectFind;
  Project.findOne = originals.projectFindOne;
  Project.findOneAndUpdate = originals.projectFindOneAndUpdate;
  Project.findOneAndDelete = originals.projectFindOneAndDelete;
  FinancialTransaction.find = originals.transactionFind;
  FinancialTransaction.create = originals.transactionCreate;
  FinancialTransaction.updateMany = originals.transactionUpdateMany;
  delete require.cache[require.resolve("../src/modules/projects/projects.routes")];
  delete require.cache[require.resolve("../src/modules/financial/financial.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId, role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role, email: "owner@nexora.test" },
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

function sortLean(value) {
  return { sort: () => lean(value) };
}

function listChain(value) {
  return { sort: () => ({ limit: () => lean(value) }) };
}

function projectDoc(overrides = {}) {
  return {
    _id: projectId,
    tenantId,
    name: "Reforma da sede",
    description: "Troca do telhado",
    type: "obra",
    status: "active",
    budget: 1000,
    budgetItems: [],
    materialTotal: 0,
    laborTotal: 0,
    costTotal: 0,
    saleTotal: 0,
    profitTotal: 0,
    profitMarginPercent: 0,
    spent: 200,
    responsibleName: "Carlos",
    responsiblePhone: "61999999999",
    location: "Sede central",
    notes: "Prioridade alta",
    createdBy: userId,
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

test("POST /api/projects cria projeto multi-tenant", async () => {
  const capture = {};
  Project.create = async (payload) => {
    capture.payload = payload;
    return projectDoc(payload);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        name: "Reforma da sede",
        description: "Troca do telhado",
        type: "obra",
        status: "planning",
        budgetItems: [
          {
            description: "Instalação de câmera",
            category: "material",
            quantity: 4,
            unit: "unidade",
            unitMaterialCost: 180,
            unitLaborCost: 120,
            totalMaterialCost: 999999,
            totalLaborCost: 999999,
            totalCost: 999999,
            salePrice: 1800,
            profit: 999999,
            notes: "não confiar no total do front"
          }
        ],
        responsibleName: "Carlos"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.project.name, "Reforma da sede");
    assert.equal(body.project.type, "obra");
  });

  assert.equal(String(capture.payload.tenantId), tenantId);
  assert.equal(String(capture.payload.createdBy), userId);
  assert.equal(capture.payload.budget, 1800);
  assert.equal(capture.payload.materialTotal, 720);
  assert.equal(capture.payload.laborTotal, 480);
  assert.equal(capture.payload.costTotal, 1200);
  assert.equal(capture.payload.saleTotal, 1800);
  assert.equal(capture.payload.profitTotal, 600);
  assert.equal(capture.payload.profitMarginPercent, 33.33);
  assert.equal(capture.payload.budgetItems[0].totalCost, 1200);
  assert.equal(capture.payload.budgetItems[0].profit, 600);
});

test("PUT /api/projects/:id edita projeto do tenant", async () => {
  const doc = projectDoc();
  Project.findOne = async (filter) => {
    assert.equal(String(filter._id), projectId);
    assert.equal(String(filter.tenantId), tenantId);
    return doc;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ status: "paused", responsibleName: "Marina", budget: 1800 })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.project.status, "paused");
    assert.equal(body.project.responsibleName, "Marina");
    assert.equal(body.project.budget, 1800);
  });

  assert.equal(doc.saveCalls, 1);
  assert.equal(doc.status, "paused");
});

test("PUT /api/projects/:id/budget atualiza orçamento com totais recalculados", async () => {
  const doc = projectDoc();
  Project.findOne = async () => doc;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/budget`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        budgetItems: [
          { description: "Câmera Intelbras", category: "material", quantity: 4, unit: "unidade", unitMaterialCost: 180, unitLaborCost: 80, salePrice: 1400 },
          { description: "Instalação/configuração", category: "mao_de_obra", quantity: 1, unit: "serviço", unitMaterialCost: 0, unitLaborCost: 300, salePrice: 500 }
        ]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.totals.materialTotal, 720);
    assert.equal(body.totals.laborTotal, 620);
    assert.equal(body.totals.costTotal, 1340);
    assert.equal(body.totals.saleTotal, 1900);
    assert.equal(body.totals.profitTotal, 560);
    assert.equal(body.totals.profitMarginPercent, 29.47);
    assert.equal(body.project.budget, 1900);
    assert.equal(body.project.budgetItems.length, 2);
  });

  assert.equal(doc.saveCalls, 1);
  assert.equal(doc.saleTotal, 1900);
  assert.equal(doc.profitTotal, 560);
  assert.equal(doc.budgetItems.length, 2);
});

test("POST /api/projects/:id/complete conclui projeto", async () => {
  const doc = projectDoc({ status: "active", endDate: null });
  Project.findOne = async () => doc;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.project.status, "completed");
    assert.ok(body.project.endDate);
  });
});

test("POST /api/projects/:id/cancel cancela projeto", async () => {
  const doc = projectDoc({ status: "active" });
  Project.findOne = async () => doc;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.project.status, "cancelled");
  });
});

test("DELETE /api/projects/:id exclui projeto e desvincula despesas", async () => {
  const capture = {};
  Project.findOneAndDelete = async (filter) => {
    capture.deleteFilter = filter;
    return projectDoc();
  };
  FinancialTransaction.updateMany = async (filter, update) => {
    capture.unlinkFilter = filter;
    capture.unlinkUpdate = update;
    return { modifiedCount: 2 };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  });

  assert.equal(String(capture.deleteFilter.tenantId), tenantId);
  assert.equal(String(capture.unlinkFilter.projectId), projectId);
  assert.deepEqual(capture.unlinkUpdate, { $unset: { projectId: 1 } });
});

test("GET /api/projects/dashboard resume projetos do tenant", async () => {
  Project.find = () => lean([
    projectDoc({ status: "active", budget: 1000, materialTotal: 400, laborTotal: 100, costTotal: 500, saleTotal: 800, profitTotal: 300, spent: 250 }),
    projectDoc({ _id: "507f1f77bcf86cd799439072", status: "completed", budget: 700, materialTotal: 300, laborTotal: 200, costTotal: 500, saleTotal: 700, profitTotal: 200, spent: 700 }),
    projectDoc({ _id: "507f1f77bcf86cd799439073", status: "paused", budget: 500, materialTotal: 200, laborTotal: 150, costTotal: 350, saleTotal: 500, profitTotal: 150, spent: 100 })
  ]);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/dashboard`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totalProjects, 3);
    assert.equal(body.activeProjects, 1);
    assert.equal(body.completedProjects, 1);
    assert.equal(body.pausedProjects, 1);
    assert.equal(body.totalBudget, 2200);
    assert.equal(body.materialTotal, 900);
    assert.equal(body.laborTotal, 450);
    assert.equal(body.costTotal, 1350);
    assert.equal(body.saleTotal, 2000);
    assert.equal(body.profitTotal, 650);
    assert.equal(body.profitMarginPercent, 32.5);
    assert.equal(body.totalSpent, 1050);
  });
});

test("GET /api/projects/:id/report retorna resumo financeiro e despesas vinculadas", async () => {
  const capture = {};
  const doc = projectDoc({
    budget: 2000,
    spent: 0,
    budgetItems: [
      { description: "Câmera Intelbras", category: "material", quantity: 4, unit: "unidade", unitMaterialCost: 180, unitLaborCost: 80, totalMaterialCost: 720, totalLaborCost: 320, totalCost: 1040, salePrice: 1400, profit: 360, notes: "" },
      { description: "Instalação/configuração", category: "mao_de_obra", quantity: 1, unit: "serviço", unitMaterialCost: 0, unitLaborCost: 300, totalMaterialCost: 0, totalLaborCost: 300, totalCost: 300, salePrice: 500, profit: 200, notes: "" }
    ],
    materialTotal: 720,
    laborTotal: 620,
    costTotal: 1340,
    saleTotal: 1900,
    profitTotal: 560,
    profitMarginPercent: 29.47
  });
  Project.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return doc;
  };
  Project.findOneAndUpdate = async (filter, update) => {
    capture.syncFilter = filter;
    capture.syncUpdate = update;
    return null;
  };
  FinancialTransaction.find = (filter) => {
    if (filter.status === "paid") {
      return lean([
        { tenantId, projectId, type: "expense", status: "paid", amount: 300 },
        { tenantId, projectId, type: "expense", status: "paid", amount: 200 }
      ]);
    }
    return sortLean([
      { _id: transactionId, tenantId, projectId, type: "expense", status: "paid", amount: 300, category: "Material", description: "Compra de cimento", dueDate: new Date("2026-06-10T00:00:00.000Z"), paidAt: new Date("2026-06-11T00:00:00.000Z"), supplierName: "Loja A", paymentMethod: "pix", notes: "ok" },
      { _id: "507f1f77bcf86cd799439042", tenantId, projectId, type: "expense", status: "pending", amount: 150, category: "Mão de obra", description: "Equipe externa", dueDate: new Date("2026-06-15T00:00:00.000Z"), supplierName: "Equipe B", paymentMethod: "bank_transfer", notes: "aguardando" }
    ]);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/report`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.project.spent, 500);
    assert.equal(body.summary.totalBudget, 2000);
    assert.equal(body.summary.materialTotal, 720);
    assert.equal(body.summary.laborTotal, 620);
    assert.equal(body.summary.costTotal, 1340);
    assert.equal(body.summary.saleTotal, 1900);
    assert.equal(body.summary.profitTotal, 560);
    assert.equal(body.summary.profitMarginPercent, 29.47);
    assert.equal(body.summary.totalSpent, 500);
    assert.equal(body.summary.remainingBudget, 1500);
    assert.equal(body.summary.estimatedProfitVsRealSpend, 1400);
    assert.equal(body.summary.costVarianceVsRealSpend, -840);
    assert.equal(body.summary.expenseCount, 2);
    assert.equal(body.summary.paidExpenses, 1);
    assert.equal(body.summary.pendingExpenses, 1);
    assert.equal(body.expenses.length, 2);
    assert.equal(body.budget.items.length, 2);
  });

  assert.equal(String(capture.syncFilter._id), projectId);
  assert.equal(capture.syncUpdate.$set.spent, 500);
});

test("GET /api/projects/:id bloqueia acesso cross-tenant", async () => {
  Project.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), otherTenantId);
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken(otherTenantId)}` }
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

test("PUT /api/projects/:id/budget bloqueia acesso cross-tenant", async () => {
  Project.findOne = async (filter) => {
    assert.equal(String(filter.tenantId), otherTenantId);
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/budget`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken(otherTenantId)}` },
      body: JSON.stringify({ budgetItems: [] })
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

test("POST /api/financial/transactions vincula despesa a projeto e recalcula gasto", async () => {
  const capture = {};
  Project.findOne = async (filter) => {
    assert.equal(String(filter._id), projectId);
    assert.equal(String(filter.tenantId), tenantId);
    return projectDoc();
  };
  FinancialTransaction.create = async (payload) => {
    capture.createPayload = payload;
    return { _id: transactionId, ...payload };
  };
  FinancialTransaction.find = (filter) => {
    capture.spentFilter = filter;
    return lean([
      { tenantId, projectId, type: "expense", status: "paid", amount: 80 },
      { tenantId, projectId, type: "expense", status: "paid", amount: 20 }
    ]);
  };
  Project.findOneAndUpdate = async (filter, update) => {
    capture.syncFilter = filter;
    capture.syncUpdate = update;
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/financial/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        type: "expense",
        category: "Material",
        description: "Compra de brita",
        amount: 100,
        dueDate: "2026-06-24",
        paymentMethod: "pix",
        projectId
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(String(body.transaction.projectId), projectId);
  });

  assert.equal(String(capture.createPayload.projectId), projectId);
  assert.equal(String(capture.spentFilter.projectId), projectId);
  assert.equal(capture.syncUpdate.$set.spent, 100);
});
