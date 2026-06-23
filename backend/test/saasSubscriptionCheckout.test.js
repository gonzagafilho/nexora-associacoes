const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const SaasSubscriptionPayment = require("../src/models/SaasSubscriptionPayment");
const TenantSubscription = require("../src/models/TenantSubscription");
const User = require("../src/models/User");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const realFetch = global.fetch;

const originals = {
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  subscriptionFindOne: TenantSubscription.findOne,
  subscriptionFindOneAndUpdate: TenantSubscription.findOneAndUpdate,
  userFindOne: User.findOne,
  paymentFindOne: SaasSubscriptionPayment.findOne,
  paymentCreate: SaasSubscriptionPayment.create
};

afterEach(() => {
  global.fetch = realFetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.mercadoPagoAccessToken;
  TenantSubscription.findOne = originals.subscriptionFindOne;
  TenantSubscription.findOneAndUpdate = originals.subscriptionFindOneAndUpdate;
  User.findOne = originals.userFindOne;
  SaasSubscriptionPayment.findOne = originals.paymentFindOne;
  SaasSubscriptionPayment.create = originals.paymentCreate;
});

function authToken() {
  return jwt.sign(
    { sub: userId, tenantId, role: "owner" },
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

test("POST /api/subscription/checkout gera Pix Mercado Pago real da assinatura SaaS", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-platform-token";

  TenantSubscription.findOneAndUpdate = async (filter, update) => {
    assert.equal(String(filter.tenantId), tenantId);
    assert.equal(update.$setOnInsert.plan, "professional");
    assert.equal(update.$setOnInsert.amount, 49.9);
    return {
      _id: "507f1f77bcf86cd799439099",
      tenantId,
      plan: "professional"
    };
  };
  TenantSubscription.findOne = () => ({ lean: async () => null });
  SaasSubscriptionPayment.findOne = () => ({ lean: async () => null });
  User.findOne = () => ({ lean: async () => ({ email: "admin@associacao.local" }) });

  let savedPayment;
  SaasSubscriptionPayment.create = async (data) => {
    savedPayment = data;
    return data;
  };

  let authorization;
  let mercadoPagoBody;
  global.fetch = async (url, options) => {
    assert.match(String(url), /api\.mercadopago\.com\/v1\/payments$/);
    authorization = options.headers.Authorization;
    mercadoPagoBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: 123456789,
        status: "pending",
        point_of_interaction: {
          transaction_data: {
            qr_code: "000201SAASPIX",
            qr_code_base64: "base64-saas-pix",
            ticket_url: "https://mercadopago.example/pix/123456789"
          }
        }
      })
    };
  };

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.paymentId, "123456789");
    assert.equal(body.status, "pending");
    assert.equal(body.amount, 49.9);
    assert.equal(body.qrCode, "000201SAASPIX");
    assert.equal(body.qrCodeBase64, "base64-saas-pix");
    assert.equal(body.copyPaste, "000201SAASPIX");
    assert.ok(body.expiresAt);
  });

  assert.equal(authorization, "Bearer APP_USR-platform-token");
  assert.equal(mercadoPagoBody.payment_method_id, "pix");
  assert.match(mercadoPagoBody.notification_url, /\/api\/subscription\/webhooks\/mercadopago$/);
  assert.equal(mercadoPagoBody.payer.email, "assinatura@nexoracloud.com.br");
  assert.equal(mercadoPagoBody.transaction_amount, 49.9);
  assert.equal(mercadoPagoBody.external_reference.startsWith(`nexora_saas_${tenantId}_`), true);
  assert.equal(savedPayment.tenantId, tenantId);
  assert.equal(savedPayment.plan, "professional");
  assert.equal(savedPayment.gateway, "mercadopago");
  assert.equal(savedPayment.gatewayPaymentId, "123456789");
  assert.equal(savedPayment.amount, 49.9);
  assert.equal(savedPayment.copyPaste, "000201SAASPIX");
  assert.equal(savedPayment.rawResponse.id, 123456789);
});


test("webhook SaaS approved ativa assinatura uma única vez", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-platform-token";

  const paymentDoc = {
    tenantId,
    subscriptionId: "507f1f77bcf86cd799439099",
    gateway: "mercadopago",
    method: "pix",
    externalId: "mp-saas-paid-1",
    gatewayPaymentId: "mp-saas-paid-1",
    status: "pending",
    amount: 49.9,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      return this;
    }
  };

  SaasSubscriptionPayment.findOne = async (query) => {
    assert.equal(query.gateway, "mercadopago");
    assert.deepEqual(query.$or, [
      { externalId: "mp-saas-paid-1" },
      { gatewayPaymentId: "mp-saas-paid-1" }
    ]);
    return paymentDoc;
  };

  let subscriptionUpdates = 0;
  let subscriptionUpdatePayload;
  TenantSubscription.findOneAndUpdate = async (filter, update) => {
    subscriptionUpdates += 1;
    subscriptionUpdatePayload = update.$set;
    assert.equal(filter._id, paymentDoc.subscriptionId);
    assert.equal(filter.tenantId, tenantId);
    return { _id: paymentDoc.subscriptionId, ...update.$set };
  };

  let authorization;
  global.fetch = async (url, options) => {
    assert.match(String(url), /api\.mercadopago\.com\/v1\/payments\/mp-saas-paid-1$/);
    authorization = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: "mp-saas-paid-1",
        status: "approved",
        date_approved: "2026-06-23T15:00:00.000Z",
        transaction_amount: 49.9
      })
    };
  };

  await withServer(async (baseUrl) => {
    const first = await realFetch(`${baseUrl}/api/subscription/webhooks/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "mp-saas-paid-1" } })
    });
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.result.activated, true);
    assert.equal(firstBody.result.alreadyPaid, false);

    const second = await realFetch(`${baseUrl}/api/subscription/webhooks/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "mp-saas-paid-1" } })
    });
    const secondBody = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondBody.result.activated, false);
    assert.equal(secondBody.result.alreadyPaid, true);
  });

  assert.equal(authorization, "Bearer APP_USR-platform-token");
  assert.equal(paymentDoc.status, "approved");
  assert.equal(paymentDoc.paidAt.toISOString(), "2026-06-23T15:00:00.000Z");
  assert.equal(paymentDoc.saveCalls, 2);
  assert.equal(subscriptionUpdates, 1);
  assert.equal(subscriptionUpdatePayload.status, "active");
  assert.equal(subscriptionUpdatePayload.plan, "professional");
  assert.equal(subscriptionUpdatePayload.amount, 49.9);
  assert.ok(subscriptionUpdatePayload.currentPeriodStart instanceof Date);
  assert.ok(subscriptionUpdatePayload.currentPeriodEnd instanceof Date);
  assert.ok(subscriptionUpdatePayload.nextBillingDate instanceof Date);
  assert.equal(subscriptionUpdatePayload.lastPaymentAt.toISOString(), "2026-06-23T15:00:00.000Z");
});

test("webhook SaaS pending apenas atualiza pagamento sem ativar assinatura", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-platform-token";

  const paymentDoc = {
    tenantId,
    subscriptionId: "507f1f77bcf86cd799439099",
    gateway: "mercadopago",
    method: "pix",
    externalId: "mp-saas-pending-1",
    gatewayPaymentId: "mp-saas-pending-1",
    status: "pending",
    amount: 49.9,
    async save() {
      this.saved = true;
      return this;
    }
  };

  SaasSubscriptionPayment.findOne = async () => paymentDoc;
  TenantSubscription.findOneAndUpdate = async () => {
    throw new Error("TenantSubscription não deveria ser ativada para pending");
  };

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      id: "mp-saas-pending-1",
      status: "pending",
      transaction_amount: 49.9
    })
  });

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/webhooks/mercadopago?data.id=mp-saas-pending-1&type=payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.activated, false);
    assert.equal(body.result.status, "pending");
  });

  assert.equal(paymentDoc.status, "pending");
  assert.equal(paymentDoc.saved, true);
  assert.equal(paymentDoc.paidAt, undefined);
});
