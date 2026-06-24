const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Tenant = require("../../models/Tenant");
const User = require("../../models/User");
const TenantBranding = require("../../models/TenantBranding");
const TenantBillingSettings = require("../../models/TenantBillingSettings");
const TenantMercadoPagoSettings = require("../../models/TenantMercadoPagoSettings");
const TenantSubscription = require("../../models/TenantSubscription");

const router = express.Router();

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

router.post("/signup", async (req, res, next) => {
  console.log("[PUBLIC SIGNUP] inicio", req.body?.email, req.body?.associationName);
  try {
    const associationName = clean(req.body.associationName);
    const ownerName = clean(req.body.ownerName);
    const phone = clean(req.body.phone);
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");

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

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

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
      trialEndsAt,
      plan: "professional",
      subscriptionStatus: "trialing"
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
        logoUrl: "",
        primaryColor: "#0ea5e9",
        secondaryColor: "#0284c7",
        documentFooter: "Documento gerado automaticamente pelo Nexora Gestão."
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
        amount: 49.90,
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
        plan: "professional",
        subscriptionStatus: "trialing",
        trialEndsAt
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
