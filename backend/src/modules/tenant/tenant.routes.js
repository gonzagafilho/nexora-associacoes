const express = require("express");
const auth = require("../../middlewares/auth");
const AuditLog = require("../../models/AuditLog");
const Tenant = require("../../models/Tenant");
const TenantBranding = require("../../models/TenantBranding");
const { parseMultipart, saveUploadedLogo } = require("../../services/branding/logoUploadService");
const { toSafeBranding } = require("../../services/branding/tenantBrandingService");

const router = express.Router();
const EDIT_ROLES = ["owner", "admin", "finance"];

function requireBrandingAdmin(req, res, next) {
  if (!EDIT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ ok: false, message: "Sem permissão para alterar branding." });
  }
  return next();
}

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function sanitizeBrandingPayload(body = {}) {
  const update = {};
  ["logoUrl", "primaryColor", "secondaryColor", "documentFooter"].forEach((field) => {
    if (body[field] !== undefined) update[field] = body[field];
  });
  if (body.logoUseProcessed !== undefined) update.logoUseProcessed = parseBooleanFlag(body.logoUseProcessed);
  if (update.primaryColor && !/^#[0-9a-f]{6}$/i.test(update.primaryColor)) {
    const error = new Error("Cor principal inválida.");
    error.statusCode = 400;
    throw error;
  }
  if (update.secondaryColor && !/^#[0-9a-f]{6}$/i.test(update.secondaryColor)) {
    const error = new Error("Cor secundária inválida.");
    error.statusCode = 400;
    throw error;
  }
  return update;
}

router.get("/branding", auth, async (req, res) => {
  const [tenant, branding] = await Promise.all([
    Tenant.findById(req.user.tenantId).lean(),
    TenantBranding.findOne({ tenantId: req.user.tenantId }).lean()
  ]);
  return res.json({ ok: true, tenant, branding: toSafeBranding(branding) });
});

router.put("/branding", auth, requireBrandingAdmin, async (req, res) => {
  try {
    const tenantUpdate = {};
    ["name", "legalDocument"].forEach((field) => {
      if (req.body.tenant?.[field] !== undefined) tenantUpdate[field] = req.body.tenant[field];
    });
    const brandingUpdate = sanitizeBrandingPayload(req.body.branding || req.body || {});
    const [tenant, branding] = await Promise.all([
      Object.keys(tenantUpdate).length
        ? Tenant.findOneAndUpdate({ _id: req.user.tenantId }, { $set: tenantUpdate }, { new: true, runValidators: true })
        : Tenant.findById(req.user.tenantId),
      TenantBranding.findOneAndUpdate(
        { tenantId: req.user.tenantId },
        { $set: brandingUpdate, $setOnInsert: { tenantId: req.user.tenantId } },
        { new: true, upsert: true, runValidators: true }
      )
    ]);
    await AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "tenant.branding.updated",
      entityType: "TenantBranding",
      entityId: branding._id,
      changedFields: [...Object.keys(tenantUpdate).map((field) => "tenant." + field), ...Object.keys(brandingUpdate).map((field) => "branding." + field)]
    }).catch(() => null);
    return res.json({ ok: true, tenant, branding: toSafeBranding(branding) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao salvar branding." });
  }
});

router.post("/branding/logo", auth, requireBrandingAdmin, async (req, res) => {
  try {
    const { fields, file } = await parseMultipart(req);
    const removeBackground = ["true", "1", "on", "yes"].includes(String(fields.removeBackground || "").toLowerCase());
    const logo = await saveUploadedLogo({ tenantId: req.user.tenantId, file, removeBackground });
    const branding = await TenantBranding.findOneAndUpdate(
      { tenantId: req.user.tenantId },
      { $set: logo, $setOnInsert: { tenantId: req.user.tenantId } },
      { new: true, upsert: true, runValidators: true }
    );
    await AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "tenant.branding.logo.uploaded",
      entityType: "TenantBranding",
      entityId: branding._id,
      changedFields: ["branding.logoOriginalPath", "branding.logoProcessedPath", "branding.backgroundRemoved", "branding.logoUseProcessed"]
    }).catch(() => null);
    return res.json({ ok: true, branding: toSafeBranding(branding), warning: logo.warning || "" });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao enviar logo." });
  }
});

module.exports = router;
