const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const Invoice = require("../src/models/Invoice");
const InvoicePix = require("../src/models/InvoicePix");
const Payment = require("../src/models/Payment");
const PaymentGatewayTransaction = require("../src/models/PaymentGatewayTransaction");
const TenantMercadoPagoSettings = require("../src/models/TenantMercadoPagoSettings");
const mercadoPagoService = require("../src/services/pix/mercadoPagoPixService");

const originals = {
  fetch: global.fetch,
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  invoiceFindOneAndUpdate: Invoice.findOneAndUpdate,
  invoicePixUpdateOne: InvoicePix.updateOne,
  paymentUpdateOne: Payment.updateOne,
  transactionFindOne: PaymentGatewayTransaction.findOne,
  transactionUpdateOne: PaymentGatewayTransaction.updateOne,
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
  TenantMercadoPagoSettings.findOne = originals.mercadoPagoSettingsFindOne;
});

test("webhook de boleto pago baixa mensalidade uma vez", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";
  TenantMercadoPagoSettings.findOne = () => ({ select: async () => null });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      id: "boleto-123",
      status: "approved",
      status_detail: "accredited",
      payment_method_id: "bolbradesco",
      transaction_amount: 38.49,
      date_approved: "2026-06-23T12:00:00.000Z",
      transaction_details: {
        external_resource_url: "https://mercadopago.example/boleto-123",
        barcode_content: "23790000000000000000000000000000000000000000"
      }
    })
  });

  const tx = {
    method: "boleto",
    invoiceId: "invoice-1",
    tenantId: "tenant-1",
    associateId: "associate-1",
    amount: 38.49,
    originalAmount: 35,
    feeAmount: 3.49,
    totalAmount: 38.49,
    status: "pending",
    saveCalls: 0,
    async save() { this.saveCalls += 1; }
  };
  let invoiceCalls = 0;
  let invoicePixCalls = 0;
  const historyIds = new Set();
  let invoiceUpdate;
  let historyUpdate;

  PaymentGatewayTransaction.updateOne = async () => ({ acknowledged: true });
  PaymentGatewayTransaction.findOne = async () => tx;
  Invoice.findOneAndUpdate = async (_filter, update) => {
    invoiceCalls += 1;
    invoiceUpdate = update;
    return invoiceCalls === 1 ? { _id: "invoice-1", associateId: "associate-1" } : null;
  };
  InvoicePix.updateOne = async () => { invoicePixCalls += 1; };
  Payment.updateOne = async (filter, update) => {
    historyIds.add(filter.gatewayPaymentId);
    historyUpdate = update;
  };

  const payload = { type: "payment", action: "payment.updated", data: { id: "boleto-123" } };
  const first = await mercadoPagoService.handleWebhook(payload);
  const second = await mercadoPagoService.handleWebhook(payload);

  assert.equal(first.method, "boleto");
  assert.equal(first.alreadyPaid, false);
  assert.equal(second.alreadyPaid, true);
  assert.equal(tx.status, "paid");
  assert.equal(tx.saveCalls, 2);
  assert.equal(invoicePixCalls, 0);
  assert.equal(historyIds.size, 1);
  assert.equal(invoiceUpdate.$set.paymentMethod, "boleto");
  assert.equal(historyUpdate.$setOnInsert.originalAmount, 35);
  assert.equal(historyUpdate.$setOnInsert.feeAmount, 3.49);
  assert.equal(historyUpdate.$setOnInsert.totalAmount, 38.49);
});
