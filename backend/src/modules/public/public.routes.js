const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Tenant = require("../../models/Tenant");
const User = require("../../models/User");
const TenantBranding = require("../../models/TenantBranding");
const TenantBillingSettings = require("../../models/TenantBillingSettings");
const TenantMercadoPagoSettings = require("../../models/TenantMercadoPagoSettings");
const TenantSubscription = require("../../models/TenantSubscription");
const {
  calculateTenantSubscription,
  REQUIRED_MODULE_CODES,
  listActiveSaasModules,
  normalizeModuleCodes
} = require("../../services/subscription/subscriptionPricingService");

const router = express.Router();

const BUSINESS_TYPE_PRESETS = {
  association: ["core", "financial", "associates", "memberbilling", "protocols"],
  company: ["core", "financial", "projects", "assets", "protocols"],
  condominium: ["core", "financial", "protocols"],
  ngo: ["core", "financial", "associates", "protocols"],
  construction: ["core", "financial", "projects", "assets", "protocols"]
};

function clean(value) {
  return String(value || "").trim();
}

function makeSlug(value) {
  const base = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return base || `tenant-${Date.now()}`;
}

function resolveBusinessType(value) {
  const normalized = clean(value).toLowerCase();
  return BUSINESS_TYPE_PRESETS[normalized] ? normalized : "association";
}

function normalizeColor(value, fallback) {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

router.get("/saas-modules", async (req, res, next) => {
  try {
    const modules = await listActiveSaasModules();
    return res.json({
      ok: true,
      requiredModuleCodes: REQUIRED_MODULE_CODES,
      modules: modules.map((item) => ({
        code: item.code,
        name: item.name,
        description: item.description,
        monthlyPrice: Number(item.monthlyPrice || 0),
        active: Boolean(item.active)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  console.log("[PUBLIC SIGNUP] inicio", req.body?.email, req.body?.associationName);
  try {
    const associationName = clean(req.body.associationName);
    const ownerName = clean(req.body.ownerName);
    const phone = clean(req.body.phone);
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const businessType = resolveBusinessType(req.body.businessType);

    if (!associationName || !ownerName || !phone || !email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Preencha nome da associação, responsável, telefone, e-mail e senha."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "A senha precisa ter pelo menos 6 caracteres."
      });
    }

    console.log("[PUBLIC SIGNUP] validado", email);
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).json({
        ok: false,
        message: "Já existe uma conta com este e-mail."
      });
    }

    const trialDays = 7;
    const requestedModules = normalizeModuleCodes(
      Array.isArray(req.body.enabledModules) && req.body.enabledModules.length
        ? req.body.enabledModules
        : BUSINESS_TYPE_PRESETS[businessType]
    );
    const previewPricing = await calculateTenantSubscription({ enabledModules: requestedModules });
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const baseSlug = makeSlug(associationName);
    const slug = `${baseSlug}-${Date.now()}`;

    console.log("[PUBLIC SIGNUP] slug", slug);
    const tenant = await Tenant.create({
      name: associationName,
      slug,
      phone,
      email,
      paymentGateway: "manual",
      status: "active",
      businessType,
      enabledModules: previewPricing.enabledModules
    });

    console.log("[PUBLIC SIGNUP] tenant criado", String(tenant._id));
    const passwordHash = await bcrypt.hash(password, 10);

    console.log("[PUBLIC SIGNUP] hash ok");
    const user = await User.create({
      tenantId: tenant._id,
      name: ownerName,
      email,
      passwordHash,
      role: "owner",
      status: "active"
    });

    console.log("[PUBLIC SIGNUP] user criado", String(user._id));
    await Promise.all([
      TenantBranding.create({
        tenantId: tenant._id,
        logoUrl: clean(req.body.branding?.logoUrl),
        primaryColor: normalizeColor(req.body.branding?.primaryColor, "#0ea5e9"),
        secondaryColor: normalizeColor(req.body.branding?.secondaryColor, "#0284c7"),
        documentFooter: clean(req.body.branding?.documentFooter) || "Documento gerado automaticamente pelo Nexora Gestão."
      }),
      TenantBillingSettings.create({
        tenantId: tenant._id
      }),
      TenantMercadoPagoSettings.create({
        tenantId: tenant._id,
        mercadopagoEnabled: false,
        mercadopagoPixEnabled: false,
        mercadopagoBoletoEnabled: false
      }),
      TenantSubscription.create({
        tenantId: tenant._id,
        plan: "professional",
        status: "trialing",
        amount: previewPricing.totalAmount,
        baseAmount: previewPricing.baseAmount,
        additionalAmount: previewPricing.additionalAmount,
        enabledModules: previewPricing.enabledModules,
        trialDays,
        trialEndsAt,
        nextBillingDate: trialEndsAt
      })
    ]);

    console.log("[PUBLIC SIGNUP] configs criadas");
    const token = jwt.sign(
      { sub: String(user._id), tenantId: String(tenant._id), role: user.role },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      ok: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        status: tenant.status,
        businessType: tenant.businessType,
        plan: "professional",
        subscriptionStatus: "trialing",
        trialEndsAt,
        trialDays,
        enabledModules: previewPricing.enabledModules
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
