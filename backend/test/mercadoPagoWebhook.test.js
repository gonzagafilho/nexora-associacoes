const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const Invoice = require("../src/models/Invoice");
const InvoicePix = require("../src/models/InvoicePix");
const Payment = require("../src/models/Payment");
const PaymentGatewayTransaction = require("../src/models/PaymentGatewayTransaction");
const TenantMercadoPagoSettings = require("../src/models/TenantMercadoPagoSettings");
const mercadoPagoPixService = require("../src/services/pix/mercadoPagoPixService");

const originals = {
  fetch: global.fetch,
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  invoiceFindOneAndUpdate: Invoice.findOneAndUpdate,
  invoicePixUpdateOne: InvoicePix.updateOne,
  paymentUpdateOne: Payment.updateOne,
  transactionFindOne: PaymentGatewayTransaction.findOne,
  transactionUpdateOne: PaymentGatewayTransaction.updateOne,
  handleWebhook: mercadoPagoPixService.handleWebhook,
  mercadoPagoSettingsFindOne: TenantMercadoPagoSettings.findOne
};

afterEach(() => {
  global.fetch = originals.fetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.accessToken;
  Invoice.findOneAndUpdate = originals.invoiceFindOneAndUpdate;
  InvoicePix.updateOne = originals.invoicePixUpdateOne;
  Payment.updateOne = originals.paymentUpdateOne;
  PaymentGatewayTransaction.findOne = originals.transactionFindOne;
  PaymentGatewayTransaction.updateOne = originals.transactionUpdateOne;
  mercadoPagoPixService.handleWebhook = originals.handleWebhook;
  TenantMercadoPagoSettings.findOne = originals.mercadoPagoSettingsFindOne;
});

test("baixa Pix approved é idempotente", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";
  TenantMercadoPagoSettings.findOne = () => ({ select: async () => null });

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      id: 164519956309,
      status: "approved",
      transaction_amount: 125.5,
      date_approved: "2026-06-22T12:00:00.000Z"
    })
  });

  const tx = {
    invoiceId: "invoice-1",
    tenantId: "tenant-1",
    associateId: "associate-1",
    amount: 125.5,
    status: "pending",
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    }
  };

  let invoiceUpdateCalls = 0;
  const paymentHistoryIds = new Set();

  PaymentGatewayTransaction.updateOne = async () => ({ acknowledged: true });
  PaymentGatewayTransaction.findOne = async () => tx;
  Invoice.findOneAndUpdate = async () => {
    invoiceUpdateCalls += 1;
    return invoiceUpdateCalls === 1
      ? { _id: "invoice-1", associateId: "associate-1" }
      : null;
  };
  InvoicePix.updateOne = async () => ({ modifiedCount: 1 });
  Payment.updateOne = async (filter) => {
    paymentHistoryIds.add(filter.gatewayPaymentId);
    return { upsertedCount: 1 };
  };

  const payload = {
    type: "payment",
    action: "payment.updated",
    data: { id: "164519956309" }
  };

  const first = await mercadoPagoPixService.handleWebhook(payload);
  const second = await mercadoPagoPixService.handleWebhook(payload);

  assert.equal(first.ok, true);
  assert.equal(first.alreadyPaid, false);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyPaid, true);
  assert.equal(tx.status, "approved");
  assert.equal(tx.rawWebhook, payload);
  assert.equal(tx.rawPayment.status, "approved");
  assert.equal(tx.saveCalls, 2);
  assert.equal(invoiceUpdateCalls, 2);
  assert.equal(paymentHistoryIds.size, 1);
});

test("endpoint /api/bolepix/webhooks/mercadopago é público", async (t) => {
  mercadoPagoPixService.handleWebhook = async (payload) => ({ ok: true, payload });

  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = app.listen(0);
  t.after(() => server.close());

  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const response = await fetch(
    `http://127.0.0.1:${port}/api/bolepix/webhooks/mercadopago`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment",
        action: "payment.updated",
        data: { id: "164519956309" }
      })
    }
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
