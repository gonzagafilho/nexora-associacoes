const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const Associate = require("../src/models/Associate");
const Invoice = require("../src/models/Invoice");
const InvoicePix = require("../src/models/InvoicePix");
const PaymentGatewayTransaction = require("../src/models/PaymentGatewayTransaction");
const TenantMercadoPagoSettings = require("../src/models/TenantMercadoPagoSettings");
const { encryptSecret } = require("../src/security/secretCrypto");
const service = require("../src/services/pix/mercadoPagoPixService");

const originals = {
  fetch: global.fetch,
  invoiceFindOne: Invoice.findOne,
  associateFindOne: Associate.findOne,
  invoicePixCreate: InvoicePix.create,
  transactionFindOne: PaymentGatewayTransaction.findOne,
  transactionCreate: PaymentGatewayTransaction.create,
  settingsFindOne: TenantMercadoPagoSettings.findOne
};

afterEach(() => {
  global.fetch = originals.fetch;
  Invoice.findOne = originals.invoiceFindOne;
  Associate.findOne = originals.associateFindOne;
  InvoicePix.create = originals.invoicePixCreate;
  PaymentGatewayTransaction.findOne = originals.transactionFindOne;
  PaymentGatewayTransaction.create = originals.transactionCreate;
  TenantMercadoPagoSettings.findOne = originals.settingsFindOne;
});

test("Pix usa Access Token criptografado do tenant", async () => {
  process.env.APP_SECRET = "pix-tenant-test-secret";
  const invoice = {
    _id: "invoice-pix-tenant",
    associateId: "associate-1",
    amountCurrent: 35,
    description: "Mensalidade",
    dueDate: new Date("2026-07-10T12:00:00.000Z"),
    async save() {}
  };
  Invoice.findOne = async () => invoice;
  Associate.findOne = async () => ({
    _id: "associate-1",
    name: "Maria",
    email: "maria@example.com"
  });
  PaymentGatewayTransaction.findOne = () => ({ lean: async () => null });
  PaymentGatewayTransaction.create = async (data) => ({
    ...data,
    toObject() { return { ...data }; }
  });
  InvoicePix.create = async (data) => ({
    ...data,
    toObject() { return { ...data }; }
  });
  TenantMercadoPagoSettings.findOne = () => ({
    select: async () => ({
      mercadopagoEnabled: true,
      mercadopagoPixEnabled: true,
      mercadopagoBoletoEnabled: false,
      mercadopagoAccessTokenEncrypted: encryptSecret("APP_USR-pix-tenant-token")
    })
  });

  let authorization;
  global.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: "pix-tenant-123",
        status: "pending",
        point_of_interaction: {
          transaction_data: {
            qr_code: "000201PIX",
            qr_code_base64: "base64-pix"
          }
        }
      })
    };
  };

  const result = await service.createPixForInvoice("invoice-pix-tenant", "tenant-1");
  assert.equal(authorization, "Bearer APP_USR-pix-tenant-token");
  assert.equal(result.transaction.method, "pix");
  assert.equal(invoice.pixPaymentId, "pix-tenant-123");
});
