const TenantMercadoPagoSettings = require("../../models/TenantMercadoPagoSettings");
const { decryptSecret, encryptSecret, maskSecret } = require("../../security/secretCrypto");

const MP_API_BASE = "https://api.mercadopago.com";
const fallbackWarnings = new Set();

function error(message, statusCode = 400) {
  const value = new Error(message);
  value.statusCode = statusCode;
  return value;
}

async function findSettingsWithSecrets(tenantId) {
  return TenantMercadoPagoSettings.findOne({ tenantId }).select(
    "+mercadopagoAccessTokenEncrypted +mercadopagoPublicKey +mercadopagoClientSecretEncrypted +mercadopagoWebhookSecretEncrypted"
  );
}

function decryptField(settings, field) {
  const value = settings?.[field];
  return value ? decryptSecret(value) : "";
}

function toSafeSettings(settings, globalFallbackAvailable = false) {
  if (!settings) {
    return {
      configured: globalFallbackAvailable,
      usingGlobalFallback: globalFallbackAvailable,
      mercadopagoEnabled: globalFallbackAvailable,
      mercadopagoEnvironment: "production",
      mercadopagoPixEnabled: globalFallbackAvailable,
      mercadopagoBoletoEnabled: false,
      mercadopagoBoletoMethod: "bolbradesco",
      mercadopagoLastTestStatus: "never",
      accessTokenMasked: globalFallbackAvailable ? maskSecret(process.env.MERCADOPAGO_ACCESS_TOKEN) : ""
    };
  }

  const accessToken = decryptField(settings, "mercadopagoAccessTokenEncrypted");
  const clientSecret = decryptField(settings, "mercadopagoClientSecretEncrypted");
  const webhookSecret = decryptField(settings, "mercadopagoWebhookSecretEncrypted");
  const publicKey = settings.mercadopagoPublicKey || "";
  const plain = settings.toObject ? settings.toObject() : { ...settings };

  delete plain.mercadopagoAccessTokenEncrypted;
  delete plain.mercadopagoPublicKey;
  delete plain.mercadopagoClientSecretEncrypted;
  delete plain.mercadopagoWebhookSecretEncrypted;

  return {
    ...plain,
    configured: Boolean(accessToken),
    usingGlobalFallback: false,
    accessTokenMasked: maskSecret(accessToken),
    publicKeyMasked: maskSecret(publicKey),
    clientSecretMasked: maskSecret(clientSecret),
    webhookSecretMasked: maskSecret(webhookSecret)
  };
}

async function resolveTenantCredentials(tenantId, method, options = {}) {
  const settings = await findSettingsWithSecrets(tenantId);
  const globalToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "";

  if (!settings) {
    if (globalToken && options.allowGlobalFallback !== false) {
      const warningKey = String(tenantId);
      if (!fallbackWarnings.has(warningKey)) {
        console.warn("[MP CONFIG] tenant usando credencial global", warningKey);
        fallbackWarnings.add(warningKey);
      }
      return {
        accessToken: globalToken,
        environment: "production",
        boletoMethod: process.env.MERCADOPAGO_BOLETO_PAYMENT_METHOD_ID || "bolbradesco",
        settings: null,
        usingGlobalFallback: true
      };
    }
    throw error("Mercado Pago não configurado para esta associação.", 403);
  }

  if (!settings.mercadopagoEnabled && !options.allowDisabled) {
    throw error("Mercado Pago está desativado para esta associação.", 403);
  }
  if (method === "pix" && !settings.mercadopagoPixEnabled && !options.allowDisabled) {
    throw error("Pix Mercado Pago está desativado para esta associação.", 403);
  }
  if (method === "boleto" && !settings.mercadopagoBoletoEnabled && !options.allowDisabled) {
    throw error("Boleto Mercado Pago está desativado para esta associação.", 403);
  }

  const accessToken = decryptField(settings, "mercadopagoAccessTokenEncrypted");
  if (!accessToken) {
    if (globalToken && options.allowGlobalFallback !== false) {
      console.warn("[MP CONFIG] tenant sem token usando credencial global", String(tenantId));
      return {
        accessToken: globalToken,
        environment: settings.mercadopagoEnvironment,
        boletoMethod: settings.mercadopagoBoletoMethod || "bolbradesco",
        settings,
        usingGlobalFallback: true
      };
    }
    throw error("Mercado Pago não configurado para esta associação.", 403);
  }

  return {
    accessToken,
    environment: settings.mercadopagoEnvironment,
    boletoMethod: settings.mercadopagoBoletoMethod || "bolbradesco",
    settings,
    usingGlobalFallback: false
  };
}

async function mercadoPagoRequest(path, accessToken, options = {}) {
  const response = await fetch(`${MP_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }
  if (!response.ok) {
    throw error(`Mercado Pago erro ${response.status}: ${JSON.stringify(data)}`, 502);
  }
  return data;
}

function applySecretUpdate(update, body, plainField, encryptedField, clearFlag) {
  if (body[clearFlag] === true) {
    update[encryptedField] = "";
  } else if (String(body[plainField] || "").trim()) {
    update[encryptedField] = encryptSecret(String(body[plainField]).trim());
  }
}

module.exports = {
  applySecretUpdate,
  error,
  findSettingsWithSecrets,
  mercadoPagoRequest,
  resolveTenantCredentials,
  toSafeSettings
};
