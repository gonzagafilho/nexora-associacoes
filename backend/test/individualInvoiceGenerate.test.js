const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Associate = require("../src/models/Associate");
const Invoice = require("../src/models/Invoice");
const Tenant = require("../src/models/Tenant");
const TenantBillingSettings = require("../src/models/TenantBillingSettings");
const TenantBranding = require("../src/models/TenantBranding");
const InvoicePix = require("../src/models/InvoicePix");
const PaymentGatewayTransaction = require("../src/models/PaymentGatewayTransaction");
const mercadoPagoPixService = require("../src/services/pix/mercadoPagoPixService");
const pdfService = require("../src/services/pdfService");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const associateId = "507f1f77bcf86cd799439021";
const invoiceId = "507f1f77bcf86cd799439031";
const userId = "507f191e810c19729de860ea";
const realFetch = global.fetch;

const originals = {
  associateFindOne: Associate.findOne,
  invoiceCreate: Invoice.create,
  tenantFindById: Tenant.findById,
  billingFindOne: TenantBillingSettings.findOne,
  brandingFindOne: TenantBranding.findOne,
  invoicePixFindOne: InvoicePix.findOne,
  transactionFindOne: PaymentGatewayTransaction.findOne,
  createPixForInvoice: mercadoPagoPixService.createPixForInvoice,
  generateInvoicePdf: pdfService.generateInvoicePdf
};

afterEach(() => {
  global.fetch = realFetch;
  Associate.findOne = originals.associateFindOne;
  Invoice.create = originals.invoiceCreate;
  Tenant.findById = originals.tenantFindById;
  TenantBillingSettings.findOne = originals.billingFindOne;
  TenantBranding.findOne = originals.brandingFindOne;
  InvoicePix.findOne = originals.invoicePixFindOne;
  PaymentGatewayTransaction.findOne = originals.transactionFindOne;
  mercadoPagoPixService.createPixForInvoice = originals.createPixForInvoice;
  pdfService.generateInvoicePdf = originals.generateInvoicePdf;
  delete require.cache[require.resolve("../src/modules/invoices/invoices.routes")];
});

function authToken(currentTenantId = tenantId, role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

async function withServer(callback) {
  delete require.cache[require.resolve("../src/app")];
  delete require.cache[require.resolve("../src/modules/invoices/invoices.routes")];
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

function sortedLean(value) {
  return { sort: () => lean(value) };
}

function mockSettings() {
  const settings = {
    defaultDiscountValue: 0,
    defaultLateFeeType: "fixed",
    defaultLateFeeValue: 2,
    defaultDailyInterestType: "percent",
    defaultDailyInterestValue: 0.033,
    pdfMessage: "Mensagem PDF"
  };
  settings.lean = async () => settings;
  TenantBillingSettings.findOne = () => settings;
}

function mockInvoiceCreate(capture) {
  Invoice.create = async (payload) => {
    capture.payload = payload;
    return {
      _id: invoiceId,
      ...payload,
      saveCalls: 0,
      async save() {
        this.saveCalls += 1;
        return this;
      }
    };
  };
}

test("POST /api/invoices/admin/associates/:associateId/generate gera invoice para associado do mesmo tenant", async () => {
  const capture = {};
  Associate.findOne = async (query) => {
    assert.equal(String(query._id), associateId);
    assert.equal(String(query.tenantId), tenantId);
    return { _id: associateId, tenantId, name: "Associado Um" };
  };
  mockSettings();
  mockInvoiceCreate(capture);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/invoices/admin/associates/${associateId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ amount: 50, dueDate: "2026-07-10", description: "Mensalidade Julho/2026" })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.invoiceId, invoiceId);
    assert.equal(body.associateId, associateId);
    assert.equal(body.amount, 50);
    assert.equal(body.status, "pending");
    assert.equal(body.pix, null);
    assert.equal(body.pdfUrl, null);
  });

  assert.equal(capture.payload.tenantId, tenantId);
  assert.equal(capture.payload.associateId, associateId);
  assert.equal(capture.payload.type, "manual");
  assert.equal(capture.payload.description, "Mensalidade Julho/2026");
  assert.equal(capture.payload.lateFeeValue, 2);
  assert.equal(capture.payload.metadata.source, "individual-admin");
  assert.equal(capture.payload.metadata.generatedBy, userId);
});

test("POST /api/invoices/admin/associates/:associateId/generate bloqueia associado de outro tenant", async () => {
  Associate.findOne = async (query) => {
    assert.equal(String(query._id), associateId);
    assert.equal(String(query.tenantId), tenantId);
    return null;
  };
  mockSettings();
  Invoice.create = async () => {
    throw new Error("não deveria criar invoice de outro tenant");
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/invoices/admin/associates/${associateId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ amount: 50, dueDate: "2026-07-10", description: "Mensalidade Julho/2026" })
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.message, "Associado não encontrado.");
  });
});

test("POST /api/invoices/admin/associates/:associateId/generate gera PIX e PDF quando solicitado", async () => {
  const capture = {};
  let associateCalls = 0;
  Associate.findOne = async (query) => {
    associateCalls += 1;
    assert.equal(String(query.tenantId), tenantId);
    return { _id: associateId, tenantId, name: "Associado Um", cpf: "123" };
  };
  mockSettings();
  mockInvoiceCreate(capture);
  Tenant.findById = (id) => {
    assert.equal(String(id), tenantId);
    return Promise.resolve({ _id: tenantId, name: "Associação Modelo" });
  };
  TenantBranding.findOne = () => lean({ primaryColor: "#0ea5e9" });
  InvoicePix.findOne = () => sortedLean({ pixCopyPaste: "000201PIX", qrCodeText: "000201PIX" });
  PaymentGatewayTransaction.findOne = () => sortedLean(null);

  mercadoPagoPixService.createPixForInvoice = async (id, currentTenantId) => {
    assert.equal(String(id), invoiceId);
    assert.equal(String(currentTenantId), tenantId);
    return {
      transaction: { externalId: "mp-invoice-1", qrCode: "000201PIX", qrCodeBase64: "base64-pix", amount: 50, status: "pending" },
      invoicePix: { gatewayPaymentId: "mp-invoice-1", qrCodeText: "000201PIX", pixCopyPaste: "000201PIX", amount: 50, status: "active" }
    };
  };
  pdfService.generateInvoicePdf = async ({ invoice, associate, tenant, invoicePix }) => {
    assert.equal(String(invoice._id), invoiceId);
    assert.equal(String(associate._id), associateId);
    assert.equal(String(tenant._id), tenantId);
    assert.equal(invoicePix.pixCopyPaste, "000201PIX");
    return { relativePath: "/storage/invoices/invoice.pdf", documentId: "pdf-doc-1" };
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/invoices/admin/associates/${associateId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ amount: 50, dueDate: "2026-07-10", description: "Mensalidade Julho/2026", generatePix: true, generatePdf: true })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.invoiceId, invoiceId);
    assert.deepEqual(body.pix, {
      gatewayPaymentId: "mp-invoice-1",
      qrCode: "000201PIX",
      qrCodeBase64: "base64-pix",
      copyPaste: "000201PIX",
      amount: 50,
      expiresAt: null,
      status: "active"
    });
    assert.equal(body.pdfUrl, "/storage/invoices/invoice.pdf");
    assert.equal(body.pdfDocumentId, "pdf-doc-1");
  });

  assert.equal(associateCalls, 2);
  assert.equal(capture.payload.metadata.reference, "Mensalidade Julho/2026");
});
