const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const FinancialTransaction = require("../src/models/FinancialTransaction");
const Tenant = require("../src/models/Tenant");
const TenantBranding = require("../src/models/TenantBranding");
const monthlyReportPdfService = require("../src/services/financial/monthlyFinancialReportPdfService");
const { createIncomeForPaidInvoice } = require("../src/services/financial/financialTransactionService");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const transactionId = "507f1f77bcf86cd799439041";
const invoiceId = "507f1f77bcf86cd799439031";
const realFetch = global.fetch;

const originals = {
  create: FinancialTransaction.create,
  find: FinancialTransaction.find,
  findOne: FinancialTransaction.findOne,
  countDocuments: FinancialTransaction.countDocuments,
  tenantFindById: Tenant.findById,
  brandingFindOne: TenantBranding.findOne,
  generateMonthlyFinancialReportPdf: monthlyReportPdfService.generateMonthlyFinancialReportPdf
};

afterEach(() => {
  global.fetch = realFetch;
  FinancialTransaction.create = originals.create;
  FinancialTransaction.find = originals.find;
  FinancialTransaction.findOne = originals.findOne;
  FinancialTransaction.countDocuments = originals.countDocuments;
  Tenant.findById = originals.tenantFindById;
  TenantBranding.findOne = originals.brandingFindOne;
  monthlyReportPdfService.generateMonthlyFinancialReportPdf = originals.generateMonthlyFinancialReportPdf;
  delete require.cache[require.resolve("../src/modules/financial/financial.routes")];
  delete require.cache[require.resolve("../src/services/financial/monthlyFinancialReportService")];
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
  delete require.cache[require.resolve("../src/modules/financial/financial.routes")];
  const app = require("../src/app");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function lean(value) {
  return { lean: async () => value };
}

function findChain(value, capture = {}) {
  return {
    sort(sortValue) { capture.sort = sortValue; return this; },
    skip(skipValue) { capture.skip = skipValue; return this; },
    limit(limitValue) { capture.limit = limitValue; return this; },
    lean: async () => value
  };
}

function transactionDoc(overrides = {}) {
  return {
    _id: transactionId,
    tenantId,
    type: "expense",
    category: "Energia",
    description: "Conta de energia",
    amount: 120,
    dueDate: new Date("2026-07-10T00:00:00.000Z"),
    status: "pending",
    paymentMethod: "bank_transfer",
    referenceType: "manual",
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      return this;
    },
    ...overrides
  };
}

test("POST /api/financial/transactions cria entrada manual", async () => {
  const capture = {};
  FinancialTransaction.create = async (payload) => {
    capture.payload = payload;
    return { _id: transactionId, createdAt: new Date("2026-06-24T12:00:00.000Z"), updatedAt: new Date("2026-06-24T12:00:00.000Z"), ...payload };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ type: "income", category: "Doações", description: "Doação avulsa", amount: 150, dueDate: "2026-06-24", paymentMethod: "pix" })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.transaction.type, "income");
    assert.equal(body.transaction.amount, 150);
  });

  assert.equal(capture.payload.tenantId, tenantId);
  assert.equal(capture.payload.createdBy, userId);
  assert.equal(capture.payload.referenceType, "manual");
});

test("POST /api/financial/transactions cria saída manual", async () => {
  const capture = {};
  FinancialTransaction.create = async (payload) => {
    capture.payload = payload;
    return { _id: transactionId, ...payload };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ type: "expense", category: "Fornecedor", description: "Compra de material", amount: 90.5, dueDate: "2026-07-05", paymentMethod: "cash", supplierName: "Papelaria Modelo" })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.transaction.type, "expense");
    assert.equal(body.transaction.supplierName, "Papelaria Modelo");
  });

  assert.equal(capture.payload.tenantId, tenantId);
  assert.equal(capture.payload.type, "expense");
  assert.equal(capture.payload.amount, 90.5);
});

test("GET /api/financial/transactions lista somente transações do tenant", async () => {
  const capture = {};
  FinancialTransaction.countDocuments = async (filter) => {
    capture.countFilter = filter;
    return 1;
  };
  FinancialTransaction.find = (filter) => {
    capture.findFilter = filter;
    return findChain([transactionDoc()], capture);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions?type=expense&status=pending&q=energia&page=2&limit=1", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.page, 2);
    assert.equal(body.limit, 1);
    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
  });

  assert.equal(capture.findFilter.tenantId, tenantId);
  assert.equal(capture.countFilter.tenantId, tenantId);
  assert.equal(capture.findFilter.type, "expense");
  assert.equal(capture.findFilter.status, "pending");
  assert.ok(capture.findFilter.$or);
  assert.equal(capture.skip, 1);
  assert.equal(capture.limit, 1);
});

test("PUT /api/financial/transactions/:id bloqueia acesso cross-tenant", async () => {
  FinancialTransaction.findOne = async (filter) => {
    assert.equal(filter._id, transactionId);
    assert.equal(filter.tenantId, tenantId);
    return null;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions/" + transactionId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ type: "expense", category: "Energia", description: "Alteração", amount: 100, dueDate: "2026-07-10" })
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

test("POST /api/financial/transactions/:id/pay marca como pago", async () => {
  const doc = transactionDoc();
  FinancialTransaction.findOne = async (filter) => {
    assert.equal(filter._id, transactionId);
    assert.equal(filter.tenantId, tenantId);
    return doc;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions/" + transactionId + "/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ paidAt: "2026-06-24", paymentMethod: "pix" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.transaction.status, "paid");
    assert.equal(body.transaction.paymentMethod, "pix");
  });

  assert.equal(doc.status, "paid");
  assert.equal(doc.paymentMethod, "pix");
  assert.equal(doc.saveCalls, 1);
});

test("POST /api/financial/transactions/:id/cancel cancela transação", async () => {
  const doc = transactionDoc();
  FinancialTransaction.findOne = async (filter) => {
    assert.equal(filter._id, transactionId);
    assert.equal(filter.tenantId, tenantId);
    return doc;
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/transactions/" + transactionId + "/cancel", {
      method: "POST",
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.transaction.status, "cancelled");
  });

  assert.equal(doc.status, "cancelled");
  assert.equal(doc.saveCalls, 1);
});

test("GET /api/financial/summary calcula saldo corretamente", async () => {
  FinancialTransaction.find = (filter) => {
    assert.equal(filter.tenantId, tenantId);
    return lean([
      { tenantId, type: "income", amount: 100, status: "paid", paidAt: new Date("2026-06-10T12:00:00.000Z"), dueDate: new Date("2026-06-10T12:00:00.000Z") },
      { tenantId, type: "expense", amount: 40, status: "paid", paidAt: new Date("2026-06-12T12:00:00.000Z"), dueDate: new Date("2026-06-12T12:00:00.000Z") },
      { tenantId, type: "income", amount: 200, status: "paid", paidAt: new Date("2026-05-12T12:00:00.000Z"), dueDate: new Date("2026-05-12T12:00:00.000Z") },
      { tenantId, type: "expense", amount: 30, status: "paid", paidAt: new Date("2026-05-20T12:00:00.000Z"), dueDate: new Date("2026-05-20T12:00:00.000Z") },
      { tenantId, type: "income", amount: 80, status: "pending", dueDate: new Date("2026-07-10T12:00:00.000Z") },
      { tenantId, type: "expense", amount: 25, status: "pending", dueDate: new Date("2026-07-10T12:00:00.000Z") },
      { tenantId, type: "income", amount: 15, status: "overdue", dueDate: new Date("2026-06-01T12:00:00.000Z") },
      { tenantId, type: "expense", amount: 35, status: "overdue", dueDate: new Date("2026-06-01T12:00:00.000Z") }
    ]);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/summary", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.summary, {
      incomePaidMonth: 100,
      expensePaidMonth: 40,
      balanceMonth: 60,
      incomePending: 80,
      expensePending: 25,
      overdueExpenses: 35,
      overdueIncomes: 15,
      cashBalance: 230
    });
  });
});

test("createIncomeForPaidInvoice não duplica income para invoice paga", async () => {
  const existing = { _id: transactionId, tenantId, referenceType: "invoice", referenceId: invoiceId, amount: 50 };
  FinancialTransaction.findOne = () => lean(existing);
  FinancialTransaction.create = async () => {
    throw new Error("não deveria criar entrada duplicada");
  };

  const result = await createIncomeForPaidInvoice({
    _id: invoiceId,
    tenantId,
    amountCurrent: 50,
    status: "paid",
    paidAt: new Date("2026-06-24T12:00:00.000Z")
  });

  assert.deepEqual(result, existing);
});

function mockTenant(currentTenantId = tenantId) {
  Tenant.findById = (id) => {
    assert.equal(String(id), currentTenantId);
    return lean({ _id: currentTenantId, name: "Associação Central", slug: "central", legalDocument: "12.345.678/0001-90" });
  };
}

function monthlyRows() {
  return [
    { _id: "tx-before-income", tenantId, type: "income", category: "Mensalidades", description: "Mensalidade maio", amount: 300, status: "paid", paidAt: new Date("2026-05-15T12:00:00.000Z"), dueDate: new Date("2026-05-10T12:00:00.000Z"), createdAt: new Date("2026-05-10T12:00:00.000Z") },
    { _id: "tx-before-expense", tenantId, type: "expense", category: "Energia", description: "Energia maio", amount: 80, status: "paid", paidAt: new Date("2026-05-20T12:00:00.000Z"), dueDate: new Date("2026-05-20T12:00:00.000Z"), createdAt: new Date("2026-05-20T12:00:00.000Z") },
    { _id: "tx-income-1", tenantId, type: "income", category: "Mensalidades", description: "Mensalidade junho", amount: 100, status: "paid", paidAt: new Date("2026-06-05T12:00:00.000Z"), dueDate: new Date("2026-06-05T12:00:00.000Z"), createdAt: new Date("2026-06-05T12:00:00.000Z") },
    { _id: "tx-income-2", tenantId, type: "income", category: "Eventos", description: "Evento junho", amount: 60, status: "paid", paidAt: new Date("2026-06-08T12:00:00.000Z"), dueDate: new Date("2026-06-08T12:00:00.000Z"), createdAt: new Date("2026-06-08T12:00:00.000Z") },
    { _id: "tx-income-3", tenantId, type: "income", category: "Mensalidades", description: "Mensalidade extra", amount: 40, status: "paid", paidAt: new Date("2026-06-09T12:00:00.000Z"), dueDate: new Date("2026-06-09T12:00:00.000Z"), createdAt: new Date("2026-06-09T12:00:00.000Z") },
    { _id: "tx-expense-1", tenantId, type: "expense", category: "Energia", description: "Energia junho", amount: 50, status: "paid", paidAt: new Date("2026-06-11T12:00:00.000Z"), dueDate: new Date("2026-06-11T12:00:00.000Z"), createdAt: new Date("2026-06-11T12:00:00.000Z") },
    { _id: "tx-expense-2", tenantId, type: "expense", category: "Fornecedor", description: "Fornecedor junho", amount: 30, status: "paid", paidAt: new Date("2026-06-12T12:00:00.000Z"), dueDate: new Date("2026-06-12T12:00:00.000Z"), createdAt: new Date("2026-06-12T12:00:00.000Z") },
    { _id: "tx-pending-income", tenantId, type: "income", category: "Mensalidades", description: "Pendente junho", amount: 25, status: "pending", dueDate: new Date("2026-06-20T12:00:00.000Z"), createdAt: new Date("2026-06-20T12:00:00.000Z") },
    { _id: "tx-pending-expense", tenantId, type: "expense", category: "Fornecedor", description: "Pendente despesa", amount: 15, status: "pending", dueDate: new Date("2026-06-21T12:00:00.000Z"), createdAt: new Date("2026-06-21T12:00:00.000Z") },
    { _id: "tx-outside", tenantId, type: "income", category: "Eventos", description: "Julho", amount: 999, status: "paid", paidAt: new Date("2026-07-01T12:00:00.000Z"), dueDate: new Date("2026-07-01T12:00:00.000Z"), createdAt: new Date("2026-07-01T12:00:00.000Z") }
  ];
}

function mockMonthlyRows(rows = monthlyRows(), currentTenantId = tenantId) {
  mockTenant(currentTenantId);
  TenantBranding.findOne = (filter) => {
    assert.equal(String(filter.tenantId), currentTenantId);
    return lean({ primaryColor: "#0ea5e9", documentFooter: "Documento gerado automaticamente pelo Nexora Gestão." });
  };
  FinancialTransaction.find = (filter) => {
    assert.equal(String(filter.tenantId), currentTenantId);
    return lean(rows);
  };
}

test("GET /api/financial/reports/monthly calcula openingBalance e closingBalance", async () => {
  mockMonthlyRows();
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly?month=2026-06", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.totals.openingBalance, 220);
    assert.equal(body.totals.incomePaid, 200);
    assert.equal(body.totals.expensePaid, 80);
    assert.equal(body.totals.balanceMonth, 120);
    assert.equal(body.totals.closingBalance, 340);
    assert.equal(body.totals.incomePending, 25);
    assert.equal(body.totals.expensePending, 15);
    assert.equal(body.transactions.length, 5);
  });
});

test("GET /api/financial/reports/monthly separa receitas por categoria", async () => {
  mockMonthlyRows();
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly?month=2026-06", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.byCategory.incomes, [
      { category: "Mensalidades", amount: 140, count: 2 },
      { category: "Eventos", amount: 60, count: 1 }
    ]);
  });
});

test("GET /api/financial/reports/monthly separa despesas por categoria", async () => {
  mockMonthlyRows();
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly?month=2026-06", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.byCategory.expenses, [
      { category: "Energia", amount: 50, count: 1 },
      { category: "Fornecedor", amount: 30, count: 1 }
    ]);
  });
});

test("GET /api/financial/reports/monthly filtra somente tenant logado", async () => {
  mockMonthlyRows([], otherTenantId);
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly?month=2026-06", { headers: { Authorization: "Bearer " + authToken(otherTenantId) } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(String(body.tenant.id), otherTenantId);
    assert.equal(body.transactions.length, 0);
    assert.equal(body.totals.closingBalance, 0);
  });
});

test("GET /api/financial/reports/monthly/pdf retorna ok e filename", async () => {
  mockMonthlyRows();
  monthlyReportPdfService.generateMonthlyFinancialReportPdf = async (report) => {
    assert.equal(report.period.month, "2026-06");
    assert.equal(report.tenant.name, "Associação Central");
    return { filename: "prestacao-contas-central-2026-06.pdf", filepath: "/tmp/prestacao-contas-central-2026-06.pdf", relativePath: "/storage/reports/prestacao-contas-central-2026-06.pdf" };
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly/pdf?month=2026-06", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.filename, "prestacao-contas-central-2026-06.pdf");
    assert.equal(body.month, "2026-06");
    assert.equal(body.reportUrl, "/api/financial/reports/monthly/pdf/download?month=2026-06");
  });
});

test("GET /api/financial/reports/monthly com mês inválido retorna erro", async () => {
  FinancialTransaction.find = async () => {
    throw new Error("não deve consultar transações com mês inválido");
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/financial/reports/monthly?month=2026-13", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
  });
});
