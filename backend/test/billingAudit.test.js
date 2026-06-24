const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const BillingAuditLog = require("../src/models/BillingAuditLog");
const SaasSubscriptionPayment = require("../src/models/SaasSubscriptionPayment");
const Tenant = require("../src/models/Tenant");
const TenantSubscription = require("../src/models/TenantSubscription");
const User = require("../src/models/User");
const Invoice = require("../src/models/Invoice");
const Associate = require("../src/models/Associate");
const TenantBillingSettings = require("../src/models/TenantBillingSettings");
const mercadoPagoPixService = require("../src/services/pix/mercadoPagoPixService");
const { createBillingAuditLog, sanitizeMetadata } = require("../src/services/audit/billingAuditService");

const tenantId = "507f1f77bcf86cd799439011";
const associateId = "507f1f77bcf86cd799439021";
const invoiceId = "507f1f77bcf86cd799439031";
const userId = "507f191e810c19729de860ea";
const subscriptionId = "507f1f77bcf86cd799439099";
const realFetch = global.fetch;

const originals = {
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  billingCreate: BillingAuditLog.create,
  billingFind: BillingAuditLog.find,
  billingCountDocuments: BillingAuditLog.countDocuments,
  paymentFindOne: SaasSubscriptionPayment.findOne,
  paymentCreate: SaasSubscriptionPayment.create,
  tenantFind: Tenant.find,
  tenantFindById: Tenant.findById,
  subscriptionFindOne: TenantSubscription.findOne,
  subscriptionFindOneAndUpdate: TenantSubscription.findOneAndUpdate,
  userFindOne: User.findOne,
  associateFindOne: Associate.findOne,
  invoiceCreate: Invoice.create,
  billingSettingsFindOne: TenantBillingSettings.findOne,
  createPixForInvoice: mercadoPagoPixService.createPixForInvoice
};

afterEach(() => {
  global.fetch = realFetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.mercadoPagoAccessToken;
  BillingAuditLog.create = originals.billingCreate;
  BillingAuditLog.find = originals.billingFind;
  BillingAuditLog.countDocuments = originals.billingCountDocuments;
  SaasSubscriptionPayment.findOne = originals.paymentFindOne;
  SaasSubscriptionPayment.create = originals.paymentCreate;
  Tenant.find = originals.tenantFind;
  Tenant.findById = originals.tenantFindById;
  TenantSubscription.findOne = originals.subscriptionFindOne;
  TenantSubscription.findOneAndUpdate = originals.subscriptionFindOneAndUpdate;
  User.findOne = originals.userFindOne;
  Associate.findOne = originals.associateFindOne;
  Invoice.create = originals.invoiceCreate;
  TenantBillingSettings.findOne = originals.billingSettingsFindOne;
  mercadoPagoPixService.createPixForInvoice = originals.createPixForInvoice;
});

function authToken(role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId, role, email: "admin@nexora.test" },
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

function settings() {
  return {
    defaultDiscountValue: 0,
    defaultLateFeeType: "fixed",
    defaultLateFeeValue: 2,
    defaultDailyInterestType: "percent",
    defaultDailyInterestValue: 0.033
  };
}

test("createBillingAuditLog não quebra quando persistência falha e sanitiza metadata", async () => {
  BillingAuditLog.create = async () => {
    throw new Error("mongo indisponível");
  };

  await createBillingAuditLog({
    action: "saas_checkout",
    scope: "saas",
    status: "success",
    tenantId,
    metadata: { ok: true, accessToken: "secret", nested: { rawResponse: { id: 1 }, safe: "x" } }
  });

  assert.deepEqual(sanitizeMetadata({ token: "secret", keep: "ok", nested: { clientSecret: "s", value: 1 } }), {
    keep: "ok",
    nested: { value: 1 }
  });
});

test("checkout SaaS gera audit log", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-platform-token";
  const logs = [];
  BillingAuditLog.create = async (data) => { logs.push(data); return data; };
  TenantSubscription.findOneAndUpdate = async () => ({ _id: subscriptionId, tenantId });
  SaasSubscriptionPayment.findOne = () => lean(null);
  User.findOne = () => lean({ email: "admin@nexora.test" });
  SaasSubscriptionPayment.create = async (data) => ({ _id: "507f1f77bcf86cd799439124", ...data });
  global.fetch = async () => ({
    ok: true,
    status: 201,
    text: async () => JSON.stringify({
      id: "mp-checkout-audit",
      status: "pending",
      point_of_interaction: { transaction_data: { qr_code: "000201", qr_code_base64: "base64" } }
    })
  });

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    assert.equal(response.status, 200);
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "saas_checkout");
  assert.equal(logs[0].scope, "saas");
  assert.equal(logs[0].status, "success");
  assert.equal(logs[0].userEmail, "admin@nexora.test");
  assert.equal(logs[0].gatewayPaymentId, "mp-checkout-audit");
  assert.equal(logs[0].metadata.rawResponse, undefined);
});

test("PIX manual SaaS gera audit log", async () => {
  const logs = [];
  BillingAuditLog.create = async (data) => { logs.push(data); return data; };
  TenantSubscription.findOne = async () => ({ _id: subscriptionId, tenantId });
  SaasSubscriptionPayment.findOne = () => lean({
    _id: "507f1f77bcf86cd799439125",
    tenantId,
    subscriptionId,
    gatewayPaymentId: "mp-existing-audit",
    amount: 49.9,
    status: "pending",
    qrCode: "000201",
    copyPaste: "000201",
    expiresAt: new Date("2026-07-01T00:00:00.000Z")
  });

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/admin/${tenantId}/generate-pix`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    assert.equal(response.status, 200);
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "saas_manual_pix");
  assert.equal(logs[0].status, "reused");
  assert.equal(logs[0].saasPaymentId, "507f1f77bcf86cd799439125");
  assert.equal(logs[0].gatewayPaymentId, "mp-existing-audit");
});

test("cobrança individual associado gera audit log", async () => {
  const logs = [];
  BillingAuditLog.create = async (data) => { logs.push(data); return data; };
  Associate.findOne = async () => ({ _id: associateId, tenantId, name: "Associado" });
  TenantBillingSettings.findOne = () => settings();
  Invoice.create = async (payload) => ({
    _id: invoiceId,
    ...payload,
    async save() { return this; }
  });
  mercadoPagoPixService.createPixForInvoice = async () => ({
    transaction: { externalId: "mp-invoice-audit", qrCode: "000201", amount: 50, status: "pending" },
    invoicePix: { gatewayPaymentId: "mp-invoice-audit", pixCopyPaste: "000201", amount: 50, status: "active" }
  });

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/invoices/admin/associates/${associateId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ amount: 50, dueDate: "2026-07-10", description: "Mensalidade", generatePix: true, generatePdf: false })
    });
    assert.equal(response.status, 201);
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "associate_invoice_manual");
  assert.equal(logs[0].scope, "associate");
  assert.equal(logs[0].status, "success");
  assert.equal(logs[0].invoiceId, invoiceId);
  assert.equal(logs[0].associateId, associateId);
  assert.equal(logs[0].gatewayPaymentId, "mp-invoice-audit");
});

test("GET /api/subscription/admin/audit retorna lista paginada e aplica filtros básicos", async () => {
  const createdAt = new Date("2026-06-24T10:00:00.000Z");
  let countFilter;
  let findFilter;
  let sortArg;
  let skipArg;
  let limitArg;

  Tenant.find = (query) => ({
    select: () => ({
      lean: async () => {
        if (query.$or) return [{ _id: tenantId }];
        return [{ _id: tenantId, name: "Associação Central", slug: "central" }];
      }
    })
  });
  BillingAuditLog.countDocuments = async (filter) => { countFilter = filter; return 1; };
  BillingAuditLog.find = (filter) => {
    findFilter = filter;
    return {
      sort(arg) { sortArg = arg; return this; },
      skip(arg) { skipArg = arg; return this; },
      limit(arg) { limitArg = arg; return this; },
      async lean() {
        return [{
          _id: "507f1f77bcf86cd799439201",
          tenantId,
          userEmail: "admin@nexora.test",
          userRole: "owner",
          ip: "127.0.0.1",
          action: "saas_manual_pix",
          scope: "saas",
          status: "success",
          message: "PIX gerado",
          saasPaymentId: "507f1f77bcf86cd799439125",
          gatewayPaymentId: "mp-audit-1",
          amount: 49.9,
          createdAt
        }];
      }
    };
  };

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/admin/audit?scope=saas&action=saas_manual_pix&status=success&q=Central&page=2&limit=1`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.page, 2);
    assert.equal(body.limit, 1);
    assert.equal(body.total, 1);
    assert.equal(body.items[0].tenantName, "Associação Central");
    assert.equal(body.items[0].action, "saas_manual_pix");
    assert.equal(body.items[0].gatewayPaymentId, "mp-audit-1");
  });

  assert.equal(countFilter.scope, "saas");
  assert.equal(findFilter.action, "saas_manual_pix");
  assert.equal(findFilter.status, "success");
  assert.equal(findFilter.$or.some((entry) => entry.tenantId && entry.tenantId.$in), true);
  assert.deepEqual(sortArg, { createdAt: -1 });
  assert.equal(skipArg, 1);
  assert.equal(limitArg, 1);
});
