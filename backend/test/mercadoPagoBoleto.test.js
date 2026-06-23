const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const Associate = require("../src/models/Associate");
const Invoice = require("../src/models/Invoice");
const PaymentGatewayTransaction = require("../src/models/PaymentGatewayTransaction");
const TenantBillingSettings = require("../src/models/TenantBillingSettings");
const TenantMercadoPagoSettings = require("../src/models/TenantMercadoPagoSettings");
const { encryptSecret } = require("../src/security/secretCrypto");
const service = require("../src/services/boleto/mercadoPagoBoletoService");

const originals = {
  fetch: global.fetch,
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  invoiceFindOne: Invoice.findOne,
  associateFindOne: Associate.findOne,
  settingsFindOne: TenantBillingSettings.findOne,
  transactionFindOne: PaymentGatewayTransaction.findOne,
  transactionCreate: PaymentGatewayTransaction.create,
  mercadoPagoSettingsFindOne: TenantMercadoPagoSettings.findOne
};

afterEach(() => {
  global.fetch = originals.fetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.accessToken;
  Invoice.findOne = originals.invoiceFindOne;
  Associate.findOne = originals.associateFindOne;
  TenantBillingSettings.findOne = originals.settingsFindOne;
  PaymentGatewayTransaction.findOne = originals.transactionFindOne;
  PaymentGatewayTransaction.create = originals.transactionCreate;
  TenantMercadoPagoSettings.findOne = originals.mercadoPagoSettingsFindOne;
});

function validAssociate() {
  return {
    _id: "associate-1",
    name: "Maria da Silva",
    cpf: "529.982.247-25",
    email: "maria@example.com",
    phone: "61999999999",
    address: "Rua das Flores",
    addressNumber: "100",
    neighborhood: "Centro",
    city: "Brasília",
    state: "DF",
    zipCode: "70000-000"
  };
}

function mockCreation(settings) {
  process.env.APP_SECRET = "boleto-tenant-test-secret";
  TenantMercadoPagoSettings.findOne = () => ({
    select: async () => ({
      mercadopagoEnabled: true,
      mercadopagoPixEnabled: true,
      mercadopagoBoletoEnabled: true,
      mercadopagoBoletoMethod: "bolbradesco",
      mercadopagoAccessTokenEncrypted: encryptSecret("APP_USR-boleto-tenant-token")
    })
  });
  const invoice = {
    _id: "invoice-1",
    associateId: "associate-1",
    amountCurrent: 35,
    description: "Mensalidade",
    status: "pending",
    saveCalls: 0,
    async save() { this.saveCalls += 1; }
  };
  let sentBody;
  let authorization;

  Invoice.findOne = async () => invoice;
  Associate.findOne = async () => validAssociate();
  TenantBillingSettings.findOne = () => ({ lean: async () => settings });
  PaymentGatewayTransaction.findOne = () => ({ lean: async () => null });
  PaymentGatewayTransaction.create = async (data) => ({
    ...data,
    toObject() { return { ...data }; }
  });
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    authorization = options.headers.Authorization;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: "boleto-123",
        status: "pending",
        date_of_expiration: "2026-06-27T23:59:59.000Z",
        transaction_details: {
          external_resource_url: "https://www.mercadopago.com.br/payments/boleto-123/ticket",
          barcode_content: "23790000000000000000000000000000000000000000"
        }
      })
    };
  };

  return {
    invoice,
    getSentBody: () => sentBody,
    getAuthorization: () => authorization
  };
}

test("gera boleto com taxa fixa repassada", async () => {
  const mocks = mockCreation({
    boletoEnabled: true,
    boletoFeeMode: "fixed",
    boletoFeeAmount: 3.49,
    boletoDueDays: 4
  });

  const result = await service.createBoletoForInvoice("invoice-1", "tenant-1");

  assert.equal(result.boleto.originalAmount, 35);
  assert.equal(result.boleto.feeAmount, 3.49);
  assert.equal(result.boleto.totalAmount, 38.49);
  assert.equal(mocks.getSentBody().transaction_amount, 38.49);
  assert.equal(mocks.getSentBody().payment_method_id, "bolbradesco");
  assert.equal(mocks.getAuthorization(), "Bearer APP_USR-boleto-tenant-token");
  assert.equal(mocks.getSentBody().payer.identification.number, "52998224725");
  assert.equal(mocks.invoice.boletoPaymentId, "boleto-123");
});

test("gera boleto com taxa percentual repassada", async () => {
  const mocks = mockCreation({
    boletoEnabled: true,
    boletoFeeMode: "percent",
    boletoFeeAmount: 10,
    boletoDueDays: 3
  });

  const result = await service.createBoletoForInvoice("invoice-1", "tenant-1");

  assert.equal(result.boleto.feeAmount, 3.5);
  assert.equal(result.boleto.totalAmount, 38.5);
  assert.equal(mocks.getSentBody().transaction_amount, 38.5);
});

test("bloqueia boleto quando faltam dados obrigatórios", async () => {
  Invoice.findOne = async () => ({
    _id: "invoice-1",
    associateId: "associate-1",
    amountCurrent: 35,
    status: "pending"
  });
  TenantBillingSettings.findOne = () => ({
    lean: async () => ({ boletoEnabled: true, boletoFeeMode: "fixed", boletoFeeAmount: 3.49 })
  });
  Associate.findOne = async () => ({
    ...validAssociate(),
    address: "",
    zipCode: "",
    neighborhood: ""
  });

  await assert.rejects(
    service.createBoletoForInvoice("invoice-1", "tenant-1"),
    /Dados incompletos para gerar boleto: falta endereço, bairro, CEP\./
  );
});
