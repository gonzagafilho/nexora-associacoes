const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const FinancialTransaction = require("../src/models/FinancialTransaction");
const { createIncomeForPaidInvoice } = require("../src/services/financial/financialTransactionService");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const transactionId = "507f1f77bcf86cd799439041";
const invoiceId = "507f1f77bcf86cd799439031";
const realFetch = global.fetch;

const originals = {
  create: FinancialTransaction.create,
  find: FinancialTransaction.find,
  findOne: FinancialTransaction.findOne,
  countDocuments: FinancialTransaction.countDocuments
};

afterEach(() => {
  global.fetch = realFetch;
  FinancialTransaction.create = originals.create;
  FinancialTransaction.find = originals.find;
  FinancialTransaction.findOne = originals.findOne;
  FinancialTransaction.countDocuments = originals.countDocuments;
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
