const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const SaasSubscriptionPayment = require("../src/models/SaasSubscriptionPayment");
const Tenant = require("../src/models/Tenant");
const TenantSubscription = require("../src/models/TenantSubscription");
const { runSubscriptionRenewalJob } = require("../src/services/subscriptionRenewalJob");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const subscriptionId = "507f1f77bcf86cd799439099";
const realFetch = global.fetch;

const originals = {
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  tenantCountDocuments: Tenant.countDocuments,
  tenantFind: Tenant.find,
  tenantFindById: Tenant.findById,
  subscriptionCountDocuments: TenantSubscription.countDocuments,
  subscriptionFind: TenantSubscription.find,
  subscriptionFindOneAndUpdate: TenantSubscription.findOneAndUpdate,
  paymentFindOne: SaasSubscriptionPayment.findOne,
  paymentCreate: SaasSubscriptionPayment.create
};

afterEach(() => {
  global.fetch = realFetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.mercadoPagoAccessToken;
  process.env.PUBLIC_BASE_URL = originals.publicBaseUrl;
  Tenant.countDocuments = originals.tenantCountDocuments;
  Tenant.find = originals.tenantFind;
  Tenant.findById = originals.tenantFindById;
  TenantSubscription.countDocuments = originals.subscriptionCountDocuments;
  TenantSubscription.find = originals.subscriptionFind;
  TenantSubscription.findOneAndUpdate = originals.subscriptionFindOneAndUpdate;
  SaasSubscriptionPayment.findOne = originals.paymentFindOne;
  SaasSubscriptionPayment.create = originals.paymentCreate;
});

function authToken(role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId, role },
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

test("renovação SaaS gera PIX Mercado Pago para assinatura vencida", async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-platform-token";
  process.env.PUBLIC_BASE_URL = "https://associacoes.nexoracloud.com.br";

  const subscription = {
    _id: subscriptionId,
    tenantId,
    status: "active",
    nextBillingDate: new Date("2026-06-23T10:00:00.000Z")
  };

  TenantSubscription.find = async (query) => {
    assert.equal(query.status, "active");
    assert.ok(query.nextBillingDate.$lte instanceof Date);
    return [subscription];
  };

  SaasSubscriptionPayment.findOne = () => lean(null);
  Tenant.findById = (id) => {
    assert.equal(String(id), tenantId);
    return lean({ email: "financeiro@nexora.test" });
  };

  let savedPayment;
  SaasSubscriptionPayment.create = async (data) => {
    savedPayment = data;
    return data;
  };
  TenantSubscription.findOneAndUpdate = async () => {
    throw new Error("não deveria marcar overdue dentro da carência");
  };

  let mercadoPagoBody;
  global.fetch = async (url, options) => {
    assert.match(String(url), /api\.mercadopago\.com\/v1\/payments$/);
    assert.equal(options.headers.Authorization, "Bearer APP_USR-platform-token");
    mercadoPagoBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: "mp-renew-1",
        status: "pending",
        point_of_interaction: {
          transaction_data: {
            qr_code: "000201RENEWALPIX",
            qr_code_base64: "base64-renewal-pix",
            ticket_url: "https://mercadopago.example/pix/mp-renew-1"
          }
        }
      })
    };
  };

  const summary = await runSubscriptionRenewalJob({ now: new Date("2026-06-23T00:10:00.000Z") });

  assert.equal(summary.generated, 1);
  assert.equal(summary.alreadyPending, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(mercadoPagoBody.transaction_amount, 49.9);
  assert.equal(mercadoPagoBody.payment_method_id, "pix");
  assert.equal(mercadoPagoBody.payer.email, "financeiro@nexora.test");
  assert.match(mercadoPagoBody.notification_url, /\/api\/subscription\/webhooks\/mercadopago$/);
  assert.equal(savedPayment.tenantId, tenantId);
  assert.equal(savedPayment.subscriptionId, subscriptionId);
  assert.equal(savedPayment.plan, "professional");
  assert.equal(savedPayment.amount, 49.9);
  assert.equal(savedPayment.status, "pending");
  assert.equal(savedPayment.gatewayPaymentId, "mp-renew-1");
  assert.equal(savedPayment.qrCode, "000201RENEWALPIX");
  assert.equal(savedPayment.qrCodeBase64, "base64-renewal-pix");
  assert.equal(savedPayment.copyPaste, "000201RENEWALPIX");
  assert.ok(savedPayment.expiresAt instanceof Date);
});

test("renovação SaaS não duplica PIX quando já existe cobrança pendente", async () => {
  const subscription = {
    _id: subscriptionId,
    tenantId,
    status: "active",
    nextBillingDate: new Date("2026-06-23T00:00:00.000Z")
  };

  TenantSubscription.find = async () => [subscription];
  SaasSubscriptionPayment.findOne = () => lean({
    _id: "pending-payment-id",
    tenantId,
    subscriptionId,
    gatewayPaymentId: "mp-existing-pending",
    status: "pending"
  });
  SaasSubscriptionPayment.create = async () => {
    throw new Error("não deveria criar cobrança duplicada");
  };
  TenantSubscription.findOneAndUpdate = async () => {
    throw new Error("não deveria marcar overdue dentro da carência");
  };

  const summary = await runSubscriptionRenewalJob({ now: new Date("2026-06-23T00:10:00.000Z") });

  assert.equal(summary.generated, 0);
  assert.equal(summary.alreadyPending, 1);
  assert.equal(summary.overdue, 0);
});

test("renovação SaaS marca overdue após carência sem pagamento aprovado", async () => {
  const subscription = {
    _id: subscriptionId,
    tenantId,
    status: "active",
    nextBillingDate: new Date("2026-06-10T00:00:00.000Z")
  };

  let findOneCalls = 0;
  TenantSubscription.find = async () => [subscription];
  SaasSubscriptionPayment.findOne = () => {
    findOneCalls += 1;
    if (findOneCalls === 1) {
      return lean({ _id: "pending-payment-id", gatewayPaymentId: "mp-existing-pending" });
    }
    return lean(null);
  };

  let overdueUpdate;
  TenantSubscription.findOneAndUpdate = async (filter, update) => {
    overdueUpdate = { filter, update };
    return { ...subscription, status: "overdue" };
  };

  const summary = await runSubscriptionRenewalJob({ now: new Date("2026-06-23T00:10:00.000Z") });

  assert.equal(summary.overdue, 1);
  assert.equal(overdueUpdate.filter._id, subscriptionId);
  assert.equal(overdueUpdate.filter.tenantId, tenantId);
  assert.equal(overdueUpdate.filter.status, "active");
  assert.deepEqual(overdueUpdate.update, { $set: { status: "overdue" } });
});

test("GET /api/subscription/admin/dashboard calcula métricas SaaS", async () => {
  const counts = {
    active: 3,
    trialing: 2,
    overdue: 1,
    expiring: 4
  };

  TenantSubscription.countDocuments = async (query) => {
    if (query.status === "active") return counts.active;
    if (query.status === "trialing") return counts.trialing;
    if (query.status === "overdue") return counts.overdue;
    assert.ok(query.nextBillingDate.$lte instanceof Date);
    return counts.expiring;
  };
  Tenant.countDocuments = async () => 6;
  TenantSubscription.find = (query) => {
    assert.deepEqual(query, { status: "active" });
    return {
      select(field) {
        assert.equal(field, "amount");
        return lean([{ amount: 49.9 }, { amount: 49.9 }, { amount: 99.8 }]);
      }
    };
  };

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/admin/dashboard`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      activeSubscriptions: 3,
      trialSubscriptions: 2,
      overdueSubscriptions: 1,
      expiringNext7Days: 4,
      monthlyRevenue: 199.6,
      annualRevenue: 2395.2,
      totalTenants: 6
    });
  });
});

test("GET /api/subscription/admin/list retorna assinaturas SaaS paginadas com tenant e último pagamento", async () => {
  const createdAt = new Date("2026-06-01T10:00:00.000Z");
  const nextBillingDate = new Date("2026-07-01T10:00:00.000Z");
  const lastPaymentAt = new Date("2026-06-01T10:05:00.000Z");
  const subscription = {
    _id: subscriptionId,
    tenantId,
    plan: "professional",
    status: "active",
    amount: 49.9,
    trialEndsAt: new Date("2026-05-31T23:59:59.000Z"),
    currentPeriodStart: createdAt,
    currentPeriodEnd: nextBillingDate,
    nextBillingDate,
    lastPaymentAt,
    createdAt
  };

  TenantSubscription.countDocuments = async (filter) => {
    assert.equal(filter.status, "active");
    assert.deepEqual(filter.tenantId, { $in: [tenantId] });
    return 3;
  };

  TenantSubscription.find = (filter) => {
    assert.equal(filter.status, "active");
    assert.deepEqual(filter.tenantId, { $in: [tenantId] });
    return {
      sort(sortValue) {
        assert.deepEqual(sortValue, { createdAt: -1 });
        return {
          skip(skipValue) {
            assert.equal(skipValue, 1);
            return {
              limit(limitValue) {
                assert.equal(limitValue, 1);
                return lean([subscription]);
              }
            };
          }
        };
      }
    };
  };

  let tenantFindCalls = 0;
  Tenant.find = (query) => {
    tenantFindCalls += 1;
    if (tenantFindCalls === 1) {
      assert.ok(query.$or[0].name instanceof RegExp);
      assert.equal(query.$or[0].name.test("Nexora Associação"), true);
      assert.equal(query.$or[1].slug.test("nexora-associacao"), true);
      return { select: (field) => {
        assert.equal(field, "_id");
        return lean([{ _id: tenantId }]);
      } };
    }

    assert.deepEqual(query, { _id: { $in: [tenantId] } });
    return { select: (field) => {
      assert.equal(field, "name slug");
      return lean([{ _id: tenantId, name: "Nexora Associação", slug: "nexora-associacao" }]);
    } };
  };

  SaasSubscriptionPayment.findOne = (query) => {
    assert.deepEqual(query, { tenantId });
    return {
      sort(sortValue) {
        assert.deepEqual(sortValue, { createdAt: -1 });
        return lean({
          _id: "payment-doc-id",
          gatewayPaymentId: "mp-last-payment",
          status: "approved",
          createdAt: lastPaymentAt
        });
      }
    };
  };

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/subscription/admin/list?status=active&q=nexora&page=2&limit=1`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.page, 2);
    assert.equal(body.limit, 1);
    assert.equal(body.total, 3);
    assert.equal(body.totalPages, 3);
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.items[0], {
      tenantId,
      tenantName: "Nexora Associação",
      tenantSlug: "nexora-associacao",
      plan: "professional",
      status: "active",
      amount: 49.9,
      trialEndsAt: "2026-05-31T23:59:59.000Z",
      currentPeriodStart: "2026-06-01T10:00:00.000Z",
      currentPeriodEnd: "2026-07-01T10:00:00.000Z",
      nextBillingDate: "2026-07-01T10:00:00.000Z",
      lastPaymentAt: "2026-06-01T10:05:00.000Z",
      lastPaymentStatus: "approved",
      lastPaymentId: "mp-last-payment",
      createdAt: "2026-06-01T10:00:00.000Z"
    });
  });
});
