const express = require("express");
const auth = require("../../middlewares/auth");

const AuditLog = require("../../models/AuditLog");
const User = require("../../models/User");
const Tenant = require("../../models/Tenant");
const TenantBranding = require("../../models/TenantBranding");
const TenantBillingSettings = require("../../models/TenantBillingSettings");
const TenantMercadoPagoSettings = require("../../models/TenantMercadoPagoSettings");
const TenantSubscription = require("../../models/TenantSubscription");
const {
  applySecretUpdate,
  findSettingsWithSecrets,
  mercadoPagoRequest,
  toSafeSettings
} = require("../../services/mercadopago/tenantMercadoPagoService");

const router = express.Router();
const EDIT_ROLES = ["owner", "admin", "finance"];

function requireSettingsAdmin(req, res, next) {
  if (!EDIT_ROLES.includes(req.user.role)) {
    return res.status(403).json({
      ok: false,
      message: "Sem permissão para alterar configurações financeiras."
    });
  }
  return next();
}

function getWebhookUrl(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = req.get("host");
  return `${protocol}://${host}/api/bolepix/webhooks/mercadopago`;
}

router.get("/", auth, async (req, res) => {
  const [user, tenant, branding, billingSettings, subscription] = await Promise.all([
    User.findById(req.user.id),
    Tenant.findById(req.user.tenantId),
    TenantBranding.findOne({ tenantId: req.user.tenantId }),
    TenantBillingSettings.findOne({ tenantId: req.user.tenantId }),
    TenantSubscription.findOne({ tenantId: req.user.tenantId }).lean()
  ]);

  return res.json({ ok: true, user, tenant, branding, billingSettings, subscription });
});

router.put("/billing-settings/boleto", auth, requireSettingsAdmin, async (req, res) => {
  const boletoDueDays = Number(req.body.boletoDueDays ?? 3);
  const boletoFeeAmount = Number(req.body.boletoFeeAmount ?? 0);
  const boletoFeeMode = req.body.boletoFeeMode || "fixed";

  if (!Number.isFinite(boletoFeeAmount) || boletoFeeAmount < 0) {
    return res.status(400).json({ ok: false, message: "Taxa do boleto inválida." });
  }
  if (!["fixed", "percent"].includes(boletoFeeMode)) {
    return res.status(400).json({ ok: false, message: "Modo da taxa deve ser fixed ou percent." });
  }
  if (!Number.isInteger(boletoDueDays) || boletoDueDays < 1 || boletoDueDays > 30) {
    return res.status(400).json({ ok: false, message: "Vencimento do boleto deve ficar entre 1 e 30 dias." });
  }

  const billingSettings = await TenantBillingSettings.findOneAndUpdate(
    { tenantId: req.user.tenantId },
    {
      $set: {
        boletoEnabled: Boolean(req.body.boletoEnabled),
        boletoFeeAmount,
        boletoFeeMode,
        boletoInstructions: String(req.body.boletoInstructions || ""),
        boletoDueDays
      },
      $setOnInsert: { tenantId: req.user.tenantId }
    },
    { new: true, upsert: true, runValidators: true }
  );

  return res.json({ ok: true, billingSettings });
});

router.put("/settings", auth, requireSettingsAdmin, async (req, res) => {
  const tenantFields = ["name", "legalDocument", "phone", "email", "address"];
  const brandingFields = ["logoUrl", "primaryColor", "secondaryColor", "documentFooter"];
  const billingFields = [
    "defaultMonthlyAmount",
    "defaultDueDay",
    "defaultLateFeeType",
    "defaultLateFeeValue",
    "defaultDailyInterestType",
    "defaultDailyInterestValue",
    "defaultDiscountValue",
    "pixExpirationDays",
    "pdfMessage"
  ];
  const tenantUpdate = {};
  const brandingUpdate = {};
  const billingUpdate = {};

  for (const field of tenantFields) {
    if (req.body.tenant?.[field] !== undefined) tenantUpdate[field] = req.body.tenant[field];
  }
  for (const field of brandingFields) {
    if (req.body.branding?.[field] !== undefined) brandingUpdate[field] = req.body.branding[field];
  }
  for (const field of billingFields) {
    if (req.body.billingSettings?.[field] !== undefined) {
      billingUpdate[field] = req.body.billingSettings[field];
    }
  }

  if (brandingUpdate.primaryColor && !/^#[0-9a-f]{6}$/i.test(brandingUpdate.primaryColor)) {
    return res.status(400).json({ ok: false, message: "Cor primária inválida." });
  }
  if (brandingUpdate.secondaryColor && !/^#[0-9a-f]{6}$/i.test(brandingUpdate.secondaryColor)) {
    return res.status(400).json({ ok: false, message: "Cor secundária inválida." });
  }

  const [tenant, branding, billingSettings] = await Promise.all([
    Tenant.findOneAndUpdate(
      { _id: req.user.tenantId },
      { $set: tenantUpdate },
      { new: true, runValidators: true }
    ),
    TenantBranding.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      { $set: brandingUpdate, $setOnInsert: { tenantId: req.user.tenantId } },
      { new: true, upsert: true, runValidators: true }
    ),
    TenantBillingSettings.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      { $set: billingUpdate, $setOnInsert: { tenantId: req.user.tenantId } },
      { new: true, upsert: true, runValidators: true }
    )
  ]);

  await AuditLog.create({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: "tenant.settings.updated",
    entityType: "Tenant",
    entityId: tenant._id,
    changedFields: [
      ...Object.keys(tenantUpdate).map((field) => `tenant.${field}`),
      ...Object.keys(brandingUpdate).map((field) => `branding.${field}`),
      ...Object.keys(billingUpdate).map((field) => `billingSettings.${field}`)
    ]
  });

  return res.json({ ok: true, tenant, branding, billingSettings });
});

router.get("/mercadopago-settings", auth, requireSettingsAdmin, async (req, res) => {
  const settings = await findSettingsWithSecrets(req.user.tenantId);
  return res.json({
    ok: true,
    settings: toSafeSettings(settings, Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)),
    webhookUrl: settings?.mercadopagoWebhookUrl || getWebhookUrl(req)
  });
});

router.put("/mercadopago-settings", auth, requireSettingsAdmin, async (req, res) => {
  const current = await findSettingsWithSecrets(req.user.tenantId);
  const update = {};
  const changedFields = [];
  const simpleFields = [
    "mercadopagoEnabled",
    "mercadopagoEnvironment",
    "mercadopagoClientId",
    "mercadopagoPixEnabled",
    "mercadopagoBoletoEnabled",
    "mercadopagoBoletoMethod",
    "mercadopagoStatementDescriptor",
    "mercadopagoNotificationEmail"
  ];

  for (const field of simpleFields) {
    if (req.body[field] !== undefined) {
      update[field] = req.body[field];
      changedFields.push(field);
    }
  }

  if (req.body.mercadopagoPublicKey === "" && req.body.clearPublicKey === true) {
    update.mercadopagoPublicKey = "";
    changedFields.push("mercadopagoPublicKey");
  } else if (String(req.body.mercadopagoPublicKey || "").trim()) {
    update.mercadopagoPublicKey = String(req.body.mercadopagoPublicKey).trim();
    changedFields.push("mercadopagoPublicKey");
  }

  const secretMappings = [
    ["mercadopagoAccessToken", "mercadopagoAccessTokenEncrypted", "clearAccessToken"],
    ["mercadopagoClientSecret", "mercadopagoClientSecretEncrypted", "clearClientSecret"],
    ["mercadopagoWebhookSecret", "mercadopagoWebhookSecretEncrypted", "clearWebhookSecret"]
  ];
  for (const [plainField, encryptedField, clearFlag] of secretMappings) {
    const before = update[encryptedField];
    applySecretUpdate(update, req.body, plainField, encryptedField, clearFlag);
    if (update[encryptedField] !== before) changedFields.push(plainField);
  }

  const accessTokenWillExist =
    Boolean(update.mercadopagoAccessTokenEncrypted) ||
    (!req.body.clearAccessToken && Boolean(current?.mercadopagoAccessTokenEncrypted));
  const enabled = update.mercadopagoEnabled ?? current?.mercadopagoEnabled ?? false;
  const pixEnabled = update.mercadopagoPixEnabled ?? current?.mercadopagoPixEnabled ?? true;
  const boletoEnabled = update.mercadopagoBoletoEnabled ?? current?.mercadopagoBoletoEnabled ?? false;

  if ((enabled || pixEnabled || boletoEnabled) && !accessTokenWillExist) {
    return res.status(400).json({
      ok: false,
      message: "Informe o Access Token antes de ativar Mercado Pago, Pix ou boleto."
    });
  }

  if (update.mercadopagoEnvironment && !["production", "sandbox"].includes(update.mercadopagoEnvironment)) {
    return res.status(400).json({ ok: false, message: "Ambiente Mercado Pago inválido." });
  }
  if (update.mercadopagoBoletoMethod && !/^[a-z0-9_-]+$/i.test(update.mercadopagoBoletoMethod)) {
    return res.status(400).json({ ok: false, message: "Método de boleto inválido." });
  }

  update.mercadopagoWebhookUrl = getWebhookUrl(req);
  const settings = await TenantMercadoPagoSettings.findOneAndUpdate(
    { tenantId: req.user.tenantId },
    { $set: update, $setOnInsert: { tenantId: req.user.tenantId } },
    { new: true, upsert: true, runValidators: true }
  );

  if (req.body.mercadopagoBoletoEnabled !== undefined) {
    await TenantBillingSettings.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      {
        $set: { boletoEnabled: Boolean(req.body.mercadopagoBoletoEnabled) },
        $setOnInsert: { tenantId: req.user.tenantId }
      },
      { upsert: true }
    );
  }

  await AuditLog.create({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: "mercadopago.settings.updated",
    entityType: "TenantMercadoPagoSettings",
    entityId: settings._id,
    changedFields: [...new Set(changedFields)],
    metadata: { environment: settings.mercadopagoEnvironment }
  });

  const safeSettings = await findSettingsWithSecrets(req.user.tenantId);
  return res.json({
    ok: true,
    settings: toSafeSettings(safeSettings),
    webhookUrl: settings.mercadopagoWebhookUrl
  });
});

router.post("/mercadopago-settings/test", auth, requireSettingsAdmin, async (req, res) => {
  const settings = await findSettingsWithSecrets(req.user.tenantId);
  if (!settings?.mercadopagoAccessTokenEncrypted) {
    return res.status(400).json({ ok: false, message: "Access Token não configurado." });
  }

  const { decryptSecret } = require("../../security/secretCrypto");
  const accessToken = decryptSecret(settings.mercadopagoAccessTokenEncrypted);
  const testedAt = new Date();

  try {
    const account = await mercadoPagoRequest("/users/me", accessToken, { method: "GET" });
    const holderName =
      [account.first_name, account.last_name].filter(Boolean).join(" ") ||
      account.nickname ||
      account.email ||
      "Conta Mercado Pago";

    settings.mercadopagoLastTestAt = testedAt;
    settings.mercadopagoLastTestStatus = "success";
    settings.mercadopagoLastTestMessage = "Conexão realizada com sucesso.";
    settings.mercadopagoAccountId = String(account.id || "");
    settings.mercadopagoAccountHolderName = holderName;
    await settings.save();

    await AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "mercadopago.connection.tested",
      entityType: "TenantMercadoPagoSettings",
      entityId: settings._id,
      changedFields: ["mercadopagoLastTestAt", "mercadopagoLastTestStatus"],
      metadata: { status: "success" }
    });

    return res.json({
      ok: true,
      message: "Conexão realizada com sucesso.",
      accountId: settings.mercadopagoAccountId,
      accountHolderName: holderName,
      lastTestAt: testedAt,
      lastTestStatus: "success"
    });
  } catch (error) {
    settings.mercadopagoLastTestAt = testedAt;
    settings.mercadopagoLastTestStatus = "error";
    settings.mercadopagoLastTestMessage = error.message;
    await settings.save();

    return res.status(error.statusCode || 502).json({
      ok: false,
      message: error.message,
      lastTestAt: testedAt,
      lastTestStatus: "error"
    });
  }
});

router.post("/mercadopago-settings/webhook-url", auth, requireSettingsAdmin, async (req, res) => {
  const webhookUrl = getWebhookUrl(req);
  const settings = await TenantMercadoPagoSettings.findOneAndUpdate(
    { tenantId: req.user.tenantId },
    {
      $set: { mercadopagoWebhookUrl: webhookUrl },
      $setOnInsert: { tenantId: req.user.tenantId }
    },
    { new: true, upsert: true }
  );

  return res.json({ ok: true, webhookUrl, settingsId: settings._id });
});

module.exports = router;
