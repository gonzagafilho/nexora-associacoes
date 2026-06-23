const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const AuditLog = require("../src/models/AuditLog");
const TenantBillingSettings = require("../src/models/TenantBillingSettings");
const TenantMercadoPagoSettings = require("../src/models/TenantMercadoPagoSettings");
const { decryptSecret, encryptSecret } = require("../src/security/secretCrypto");
const {
  resolveTenantCredentials,
  toSafeSettings
} = require("../src/services/mercadopago/tenantMercadoPagoService");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const realFetch = global.fetch;
const originals = {
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  settingsFindOne: TenantMercadoPagoSettings.findOne,
  settingsFindOneAndUpdate: TenantMercadoPagoSettings.findOneAndUpdate,
  billingFindOneAndUpdate: TenantBillingSettings.findOneAndUpdate,
  auditCreate: AuditLog.create
};

process.env.APP_SECRET = "fase-4-test-secret";

afterEach(() => {
  global.fetch = realFetch;
  process.env.MERCADOPAGO_ACCESS_TOKEN = originals.accessToken;
  TenantMercadoPagoSettings.findOne = originals.settingsFindOne;
  TenantMercadoPagoSettings.findOneAndUpdate = originals.settingsFindOneAndUpdate;
  TenantBillingSettings.findOneAndUpdate = originals.billingFindOneAndUpdate;
  AuditLog.create = originals.auditCreate;
});

function settingsDocument(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439012",
    tenantId,
    mercadopagoEnabled: true,
    mercadopagoEnvironment: "production",
    mercadopagoAccessTokenEncrypted: encryptSecret("APP_USR-tenant-token-abcd"),
    mercadopagoPublicKey: "APP_USR-public-key-1234",
    mercadopagoClientId: "client-id",
    mercadopagoClientSecretEncrypted: encryptSecret("client-secret-9876"),
    mercadopagoWebhookSecretEncrypted: encryptSecret("webhook-secret-5555"),
    mercadopagoPixEnabled: true,
    mercadopagoBoletoEnabled: true,
    mercadopagoBoletoMethod: "bolbradesco",
    mercadopagoLastTestStatus: "never",
    ...overrides,
    toObject() {
      const { toObject, save, ...plain } = this;
      return { ...plain };
    },
    async save() {
      this.saveCalls = (this.saveCalls || 0) + 1;
      return this;
    }
  };
}

function mockFindSettings(doc) {
  TenantMercadoPagoSettings.findOne = () => ({ select: async () => doc });
}

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

test("GET Mercado Pago retorna apenas credenciais mascaradas", async () => {
  mockFindSettings(settingsDocument());
  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/me/mercadopago-settings`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.settings.accessTokenMasked, "APP_USR-****abcd");
    assert.match(body.settings.publicKeyMasked, /\*\*\*\*1234$/);
    assert.equal(body.settings.mercadopagoAccessTokenEncrypted, undefined);
  });
});

test("PUT salva configuração e token vazio mantém segredo atual", async () => {
  const current = settingsDocument();
  mockFindSettings(current);
  let savedUpdate;
  TenantMercadoPagoSettings.findOneAndUpdate = async (_filter, update) => {
    savedUpdate = update.$set;
    const stored = settingsDocument({ ...current, ...savedUpdate });
    mockFindSettings(stored);
    return stored;
  };
  TenantBillingSettings.findOneAndUpdate = async () => ({});
  AuditLog.create = async () => ({});

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/me/mercadopago-settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mercadopagoEnabled: true,
        mercadopagoPixEnabled: true,
        mercadopagoBoletoEnabled: true,
        mercadopagoAccessToken: "",
        mercadopagoStatementDescriptor: "NEXORA"
      })
    });
    assert.equal(response.status, 200);
    assert.equal(savedUpdate.mercadopagoAccessTokenEncrypted, undefined);
    assert.equal(decryptSecret(current.mercadopagoAccessTokenEncrypted), "APP_USR-tenant-token-abcd");
  });
});

test("Access Token só é limpo com flag explícita", async () => {
  const current = settingsDocument();
  mockFindSettings(current);
  let savedUpdate;
  TenantMercadoPagoSettings.findOneAndUpdate = async (_filter, update) => {
    savedUpdate = update.$set;
    const stored = settingsDocument({ ...current, ...savedUpdate });
    mockFindSettings(stored);
    return stored;
  };
  TenantBillingSettings.findOneAndUpdate = async () => ({});
  AuditLog.create = async () => ({});

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/me/mercadopago-settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mercadopagoEnabled: false,
        mercadopagoPixEnabled: false,
        mercadopagoBoletoEnabled: false,
        clearAccessToken: true
      })
    });
    assert.equal(response.status, 200);
    assert.equal(savedUpdate.mercadopagoAccessTokenEncrypted, "");
  });
});

test("credencial tenant é resolvida e configuração desativada bloqueia", async () => {
  mockFindSettings(settingsDocument());
  const credentials = await resolveTenantCredentials(tenantId, "pix");
  assert.equal(credentials.accessToken, "APP_USR-tenant-token-abcd");

  mockFindSettings(settingsDocument({ mercadopagoEnabled: false }));
  await assert.rejects(
    resolveTenantCredentials(tenantId, "pix"),
    /Mercado Pago está desativado/
  );
});

test("endpoint test consulta users me e grava status da conta", async () => {
  const doc = settingsDocument();
  mockFindSettings(doc);
  AuditLog.create = async () => ({});
  let authorization;
  global.fetch = async (url, options) => {
    if (!String(url).startsWith("https://api.mercadopago.com")) {
      return realFetch(url, options);
    }
    authorization = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 998877,
        first_name: "Conta",
        last_name: "Associação"
      })
    };
  };

  await withServer(async (baseUrl) => {
    const response = await realFetch(`${baseUrl}/api/me/mercadopago-settings/test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(authorization, "Bearer APP_USR-tenant-token-abcd");
    assert.equal(doc.mercadopagoLastTestStatus, "success");
    assert.equal(doc.mercadopagoAccountId, "998877");
    assert.equal(doc.mercadopagoAccountHolderName, "Conta Associação");
    assert.equal(doc.saveCalls, 1);
    assert.equal(body.lastTestStatus, "success");
  });
});

test("helper seguro nunca expõe segredos criptografados", () => {
  const safe = toSafeSettings(settingsDocument());
  assert.equal(safe.configured, true);
  assert.equal(safe.mercadopagoAccessTokenEncrypted, undefined);
  assert.equal(safe.webhookSecretMasked.endsWith("5555"), true);
});
