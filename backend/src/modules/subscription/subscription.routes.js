const express = require("express");
const crypto = require("crypto");
const auth = require("../../middlewares/auth");
const SaasSubscriptionPayment = require("../../models/SaasSubscriptionPayment");
const BillingAuditLog = require("../../models/BillingAuditLog");
const Tenant = require("../../models/Tenant");
const TenantSubscription = require("../../models/TenantSubscription");
const User = require("../../models/User");
const { mercadoPagoRequest } = require("../../services/mercadopago/tenantMercadoPagoService");
const { createBillingAuditLog } = require("../../services/audit/billingAuditService");
const {
  calculateTenantSubscription,
  roundMoney
} = require("../../services/subscription/subscriptionPricingService");

const router = express.Router();

const PROFESSIONAL_PLAN = "professional";
const PAYMENT_EXPIRATION_MINUTES = 30;

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getBaseUrl(req) {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");
}

function getPayerEmail(user) {
  const fallback = process.env.SAAS_DEFAULT_PAYER_EMAIL || "assinatura@nexoracloud.com.br";
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email || email.endsWith(".local")) return fallback;
  return email;
}

function requireAdmin(req, res, next) {
  const allowedRoles = new Set(["admin", "owner", "superadmin"]);
  if (!allowedRoles.has(req.user?.role)) {
    return res.status(403).json({ ok: false, message: "Acesso administrativo necessário." });
  }
  return next();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function calculateSubscriptionDashboard(now = new Date()) {
  const expiringLimit = addDays(now, 7);
  const [
    activeSubscriptions,
    trialSubscriptions,
    overdueSubscriptions,
    expiringNext7Days,
    totalTenants,
    activeRows
  ] = await Promise.all([
    TenantSubscription.countDocuments({ status: "active" }),
    TenantSubscription.countDocuments({ status: "trialing" }),
    TenantSubscription.countDocuments({ status: "overdue" }),
    TenantSubscription.countDocuments({ nextBillingDate: { $lte: expiringLimit } }),
    Tenant.countDocuments({}),
    TenantSubscription.find({ status: "active" }).select("amount baseAmount additionalAmount").lean()
  ]);

  const revenue = activeRows.reduce((acc, subscription) => {
    acc.base += Number(subscription.baseAmount || 0);
    acc.additional += Number(subscription.additionalAmount || 0);
    acc.total += Number(subscription.amount || 0);
    return acc;
  }, { base: 0, additional: 0, total: 0 });

  const monthlyRevenueBase = roundMoney(revenue.base || 0);
  const monthlyRevenueAdditional = roundMoney(revenue.additional || 0);
  const monthlyRevenue = roundMoney(revenue.total || 0);

  return {
    activeSubscriptions,
    trialSubscriptions,
    overdueSubscriptions,
    expiringNext7Days,
    monthlyRevenueBase,
    monthlyRevenueAdditional,
    monthlyRevenue,
    annualRevenue: monthlyRevenue * 12,
    totalTenants
  };
}

function toPositiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

function auditSaas(req, data) {
  return createBillingAuditLog({
    req,
    scope: "saas",
    ...data
  });
}

async function buildSubscriptionListFilter(query) {
  const filter = {};
  const status = String(query.status || "").trim();
  if (status) {
    filter.status = status;
  }

  const q = String(query.q || "").trim();
  if (!q) return filter;

  const regex = new RegExp(escapeRegExp(q), "i");
  const tenants = await Tenant.find({
    $or: [{ name: regex }, { slug: regex }]
  }).select("_id").lean();

  filter.tenantId = { $in: tenants.map((tenant) => tenant._id) };
  return filter;
}

async function buildAdminAuditFilter(query) {
  const filter = {};
  const scope = String(query.scope || "").trim();
  const action = String(query.action || "").trim();
  const status = String(query.status || "").trim();
  const tenantId = normalizeObjectId(query.tenantId);
  const q = String(query.q || "").trim();

  if (scope) filter.scope = scope;
  if (action) filter.action = action;
  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  if (!q) return filter;

  const regex = new RegExp(escapeRegExp(q), "i");
  const tenants = await Tenant.find({
    $or: [{ name: regex }, { slug: regex }]
  }).select("_id").lean();

  const or = [
    { userEmail: regex },
    { userRole: regex },
    { ip: regex },
    { action: regex },
    { scope: regex },
    { status: regex },
    { message: regex },
    { gatewayPaymentId: regex }
  ];

  const qObjectId = normalizeObjectId(q);
  if (qObjectId) {
    or.push(
      { _id: qObjectId },
      { tenantId: qObjectId },
      { invoiceId: qObjectId },
      { associateId: qObjectId },
      { saasPaymentId: qObjectId }
    );
  }
  if (tenants.length) or.push({ tenantId: { $in: tenants.map((tenant) => tenant._id) } });

  filter.$or = or;
  return filter;
}

async function buildAdminPaymentFilter(query) {
  const filter = {};
  const status = String(query.status || "").trim();
  const tenantId = normalizeObjectId(query.tenantId);
  const q = String(query.q || "").trim();

  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;

  if (!q) return filter;

  const regex = new RegExp(escapeRegExp(q), "i");
  const tenants = await Tenant.find({
    $or: [{ name: regex }, { slug: regex }]
  }).select("_id").lean();

  const or = [
    { gatewayPaymentId: regex },
    { externalId: regex },
    { externalReference: regex }
  ];

  const qObjectId = normalizeObjectId(q);
  if (qObjectId) or.push({ _id: qObjectId }, { tenantId: qObjectId });
  if (tenants.length) or.push({ tenantId: { $in: tenants.map((tenant) => tenant._id) } });

  filter.$or = or;
  return filter;
}

async function listAdminSubscriptions(query) {
  const page = toPositiveInt(query.page, 1, 10000);
  const limit = toPositiveInt(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = await buildSubscriptionListFilter(query);

  const [total, subscriptions] = await Promise.all([
    TenantSubscription.countDocuments(filter),
    TenantSubscription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
  ]);

  const tenantIds = subscriptions.map((subscription) => subscription.tenantId).filter(Boolean);
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select("name slug").lean();
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  const items = await Promise.all(subscriptions.map(async (subscription) => {
    const tenant = tenantsById.get(String(subscription.tenantId)) || {};
    const lastPayment = await SaasSubscriptionPayment.findOne({
      tenantId: subscription.tenantId
    }).sort({ createdAt: -1 }).lean();

    return {
      tenantId: subscription.tenantId,
      tenantName: tenant.name || "",
      tenantSlug: tenant.slug || "",
      plan: subscription.plan,
      status: subscription.status,
      amount: subscription.amount || 0,
      baseAmount: subscription.baseAmount || 0,
      additionalAmount: subscription.additionalAmount || 0,
      enabledModules: Array.isArray(subscription.enabledModules) ? subscription.enabledModules : [],
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextBillingDate: subscription.nextBillingDate,
      lastPaymentAt: subscription.lastPaymentAt,
      lastPaymentStatus: lastPayment?.status || "",
      lastPaymentId: lastPayment?.gatewayPaymentId || lastPayment?.externalId || lastPayment?._id || "",
      createdAt: subscription.createdAt
    };
  }));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0
  };
}

function formatSaasPixPayment(payment, reused = false) {
  return {
    reused,
    paymentId: payment._id,
    gatewayPaymentId: payment.gatewayPaymentId || payment.externalId || "",
    amount: payment.amount || 0,
    status: payment.status,
    qrCode: payment.qrCode || "",
    qrCodeBase64: payment.qrCodeBase64 || "",
    copyPaste: payment.copyPaste || payment.qrCode || "",
    expiresAt: payment.expiresAt || null
  };
}

async function generateManualSaasPix(req, tenantId) {
  const subscription = await TenantSubscription.findOne({ tenantId });
  if (!subscription) {
    const error = new Error("Assinatura SaaS não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  const existing = await SaasSubscriptionPayment.findOne({
    tenantId,
    subscriptionId: subscription._id,
    gateway: "mercadopago",
    method: "pix",
    plan: PROFESSIONAL_PLAN,
    status: { $in: ["pending", "in_process"] },
    expiresAt: { $gt: now }
  }).lean();

  if (existing) return formatSaasPixPayment(existing, true);

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    const error = new Error("Mercado Pago da plataforma não configurado.");
    error.statusCode = 500;
    throw error;
  }

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    const error = new Error("Associação não encontrada.");
    error.statusCode = 404;
    throw error;
  }
  const pricing = await calculateTenantSubscription({ tenantId });

  const externalReference = `nexora_saas_manual_${tenantId}_${Date.now()}`;
  const expiresAt = addMinutes(now, PAYMENT_EXPIRATION_MINUTES);
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(externalReference)
    .digest("hex");

  const payment = await mercadoPagoRequest("/v1/payments", accessToken, {
    method: "POST",
    headers: { "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      transaction_amount: pricing.totalAmount,
      description: "NEXORA Gestão Inteligente - Cobrança manual SaaS modular",
      payment_method_id: "pix",
      external_reference: externalReference,
      date_of_expiration: expiresAt.toISOString(),
      notification_url: `${getBaseUrl(req)}/api/subscription/webhooks/mercadopago`,
      payer: {
        email: getPayerEmail(tenant)
      }
    })
  });

  const transactionData = payment.point_of_interaction?.transaction_data || {};
  const qrCode = transactionData.qr_code || "";
  const saved = await SaasSubscriptionPayment.create({
    tenantId,
    subscriptionId: subscription._id,
    plan: PROFESSIONAL_PLAN,
    gateway: "mercadopago",
    method: "pix",
    source: "manual",
    externalId: String(payment.id),
    gatewayPaymentId: String(payment.id),
    externalReference,
    status: payment.status || "pending",
    amount: pricing.totalAmount,
    qrCode,
    copyPaste: qrCode,
    qrCodeBase64: transactionData.qr_code_base64 || "",
    ticketUrl: transactionData.ticket_url,
    expiresAt,
    rawCreateResponse: payment,
    rawResponse: payment,
    rawPayment: payment,
    rawLastStatusResponse: payment,
    lastCheckedAt: now
  });

  return formatSaasPixPayment(saved, false);
}

async function listAdminAudit(query) {
  const page = toPositiveInt(query.page, 1, 10000);
  const limit = toPositiveInt(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = await buildAdminAuditFilter(query);

  const [total, logs] = await Promise.all([
    BillingAuditLog.countDocuments(filter),
    BillingAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
  ]);

  const tenantIds = logs.map((log) => log.tenantId).filter(Boolean);
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select("name slug").lean();
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  return {
    items: logs.map((log) => {
      const tenant = tenantsById.get(String(log.tenantId)) || {};
      return {
        id: log._id,
        tenantId: log.tenantId,
        tenantName: tenant.name || "",
        userEmail: log.userEmail || "",
        userRole: log.userRole || "",
        ip: log.ip || "",
        action: log.action,
        scope: log.scope,
        status: log.status,
        message: log.message || "",
        invoiceId: log.invoiceId || null,
        associateId: log.associateId || null,
        saasPaymentId: log.saasPaymentId || null,
        gatewayPaymentId: log.gatewayPaymentId || "",
        amount: log.amount || 0,
        createdAt: log.createdAt
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0
  };
}

async function listAdminPayments(query) {
  const page = toPositiveInt(query.page, 1, 10000);
  const limit = toPositiveInt(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = await buildAdminPaymentFilter(query);

  const [total, payments] = await Promise.all([
    SaasSubscriptionPayment.countDocuments(filter),
    SaasSubscriptionPayment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  const tenantIds = payments.map((payment) => payment.tenantId).filter(Boolean);
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select("name slug").lean();
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  return {
    items: payments.map((payment) => {
      const tenant = tenantsById.get(String(payment.tenantId)) || {};
      return {
        paymentId: payment._id,
        gatewayPaymentId: payment.gatewayPaymentId || payment.externalId || "",
        tenantId: payment.tenantId,
        tenantName: tenant.name || "",
        tenantSlug: tenant.slug || "",
        plan: payment.plan,
        amount: payment.amount || 0,
        status: payment.status,
        gateway: payment.gateway,
        qrCode: payment.qrCode || "",
        qrCodeBase64: payment.qrCodeBase64 || "",
        copyPaste: payment.copyPaste || payment.qrCode || "",
        expiresAt: payment.expiresAt || null,
        paidAt: payment.paidAt || null,
        createdAt: payment.createdAt || null,
        updatedAt: payment.updatedAt || null
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0
  };
}

router.get("/admin/audit", auth, requireAdmin, async (req, res) => {
  try {
    const result = await listAdminAudit(req.query || {});
    return res.json(result);
  } catch (error) {
    console.error("[SAAS AUDIT] erro", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar auditoria de cobranças."
    });
  }
});

router.post("/admin/:tenantId/generate-pix", auth, requireAdmin, async (req, res) => {
  try {
    const tenantId = normalizeObjectId(req.params.tenantId);
    if (!tenantId) {
      return res.status(400).json({ ok: false, message: "tenantId inválido." });
    }

    const result = await generateManualSaasPix(req, tenantId);
    await auditSaas(req, {
      action: "saas_manual_pix",
      status: result.reused ? "reused" : "success",
      tenantId,
      saasPaymentId: result.paymentId,
      gatewayPaymentId: result.gatewayPaymentId,
      amount: result.amount,
      message: result.reused ? "PIX SaaS pendente reutilizado." : "PIX SaaS manual gerado.",
      metadata: { reused: result.reused }
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[SAAS MANUAL PIX] erro", error.message);
    await auditSaas(req, {
      action: "saas_manual_pix",
      status: "failed",
      tenantId: normalizeObjectId(req.params.tenantId) || undefined,
      message: error.message,
      metadata: { statusCode: error.statusCode || 500 }
    });
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : "Erro ao gerar PIX manual SaaS."
    });
  }
});

router.get("/admin/payments", auth, requireAdmin, async (req, res) => {
  try {
    const result = await listAdminPayments(req.query || {});
    return res.json(result);
  } catch (error) {
    console.error("[SAAS PAYMENTS] erro", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar pagamentos SaaS."
    });
  }
});

router.get("/admin/list", auth, requireAdmin, async (req, res) => {
  try {
    const result = await listAdminSubscriptions(req.query || {});
    return res.json(result);
  } catch (error) {
    console.error("[SAAS LIST] erro", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar assinaturas SaaS."
    });
  }
});

router.get("/admin/dashboard", auth, requireAdmin, async (req, res) => {
  try {
    const dashboard = await calculateSubscriptionDashboard();
    return res.json(dashboard);
  } catch (error) {
    console.error("[SAAS DASHBOARD] erro", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao calcular dashboard SaaS."
    });
  }
});

router.get("/me", auth, async (req, res) => {
  const subscription = await TenantSubscription.findOne({
    tenantId: req.user.tenantId
  }).lean();
  const pricing = await calculateTenantSubscription({ tenantId: req.user.tenantId });

  return res.json({
    ok: true,
    subscription,
    pricing
  });
});

router.post("/checkout", auth, async (req, res) => {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({
        ok: false,
        message: "Mercado Pago da plataforma não configurado."
      });
    }

    const tenantId = req.user.tenantId;
    const pricing = await calculateTenantSubscription({ tenantId });
    const subscription = await TenantSubscription.findOneAndUpdate(
      { tenantId },
      {
        $setOnInsert: {
          tenantId,
          plan: PROFESSIONAL_PLAN,
          status: "trialing",
          trialDays: 7
        },
        $set: {
          amount: pricing.totalAmount,
          baseAmount: pricing.baseAmount,
          additionalAmount: pricing.additionalAmount,
          enabledModules: pricing.enabledModules
        }
      },
      { new: true, upsert: true }
    );

    const existing = await SaasSubscriptionPayment.findOne({
      tenantId,
      subscriptionId: subscription._id,
      gateway: "mercadopago",
      method: "pix",
      plan: PROFESSIONAL_PLAN,
      status: { $in: ["pending", "in_process"] },
      expiresAt: { $gt: new Date() }
    }).lean();

    if (existing) {
      await auditSaas(req, {
        action: "saas_checkout",
        status: "reused",
        tenantId,
        saasPaymentId: existing._id,
        gatewayPaymentId: existing.gatewayPaymentId || existing.externalId || "",
        amount: existing.amount,
        message: "PIX SaaS pendente reutilizado no checkout.",
        metadata: { source: existing.source || "checkout" }
      });
      return res.json({
        ok: true,
        paymentId: existing.gatewayPaymentId || existing.externalId,
        status: existing.status,
        amount: existing.amount,
        baseAmount: pricing.baseAmount,
        additionalAmount: pricing.additionalAmount,
        enabledModules: pricing.enabledModules,
        qrCode: existing.qrCode,
        qrCodeBase64: existing.qrCodeBase64,
        copyPaste: existing.copyPaste || existing.qrCode,
        expiresAt: existing.expiresAt
      });
    }

    const user = await User.findOne({ _id: req.user.id, tenantId }).lean();
    const externalReference = `nexora_saas_${tenantId}_${Date.now()}`;
    const expiresAt = addMinutes(new Date(), 30);
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(externalReference)
      .digest("hex");

    const payment = await mercadoPagoRequest("/v1/payments", accessToken, {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        transaction_amount: pricing.totalAmount,
        description: "NEXORA Gestão Inteligente - Plano Professional",
        payment_method_id: "pix",
        external_reference: externalReference,
        date_of_expiration: expiresAt.toISOString(),
        notification_url: `${getBaseUrl(req)}/api/subscription/webhooks/mercadopago`,
        payer: {
          email: getPayerEmail(user)
        }
      })
    });

    const transactionData = payment.point_of_interaction?.transaction_data || {};
    const qrCode = transactionData.qr_code || "";
    const qrCodeBase64 = transactionData.qr_code_base64 || "";

    const saved = await SaasSubscriptionPayment.create({
      tenantId,
      subscriptionId: subscription._id,
      plan: PROFESSIONAL_PLAN,
      gateway: "mercadopago",
      method: "pix",
      source: "checkout",
      externalId: String(payment.id),
      gatewayPaymentId: String(payment.id),
      externalReference,
      status: payment.status || "pending",
      amount: pricing.totalAmount,
      qrCode,
      copyPaste: qrCode,
      qrCodeBase64,
      ticketUrl: transactionData.ticket_url,
      expiresAt,
      rawCreateResponse: payment,
      rawResponse: payment,
      rawPayment: payment,
      rawLastStatusResponse: payment,
      lastCheckedAt: new Date()
    });

    await auditSaas(req, {
      action: "saas_checkout",
      status: "success",
      tenantId,
      saasPaymentId: saved._id,
      gatewayPaymentId: saved.gatewayPaymentId || saved.externalId || "",
      amount: saved.amount,
      message: "PIX SaaS gerado no checkout.",
      metadata: { source: "checkout" }
    });

    return res.json({
      ok: true,
      paymentId: saved.gatewayPaymentId || saved.externalId,
      status: saved.status,
      amount: saved.amount,
      baseAmount: pricing.baseAmount,
      additionalAmount: pricing.additionalAmount,
      enabledModules: pricing.enabledModules,
      qrCode: saved.qrCode,
      qrCodeBase64: saved.qrCodeBase64,
      copyPaste: saved.copyPaste || saved.qrCode,
      expiresAt: saved.expiresAt
    });
  } catch (error) {
    console.error("[SAAS CHECKOUT] erro", error.message);
    await auditSaas(req, {
      action: "saas_checkout",
      status: "failed",
      tenantId: req.user?.tenantId,
      message: error.message,
      metadata: { statusCode: error.statusCode || 500 }
    });
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : "Erro ao gerar Pix da assinatura."
    });
  }
});


function getWebhookPaymentId(req) {
  return (
    req.body?.data?.id ||
    req.body?.id ||
    req.body?.resource ||
    req.query?.["data.id"] ||
    req.query?.id ||
    req.query?.resource
  );
}

function getApprovedAt(payment) {
  const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
  return Number.isNaN(approvedAt.getTime()) ? new Date() : approvedAt;
}

async function syncSaasPaymentFromMercadoPago(paymentId, webhookPayload = null) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    const error = new Error("Mercado Pago da plataforma não configurado.");
    error.statusCode = 500;
    throw error;
  }

  const subscriptionPayment = await SaasSubscriptionPayment.findOne({
    gateway: "mercadopago",
    $or: [
      { externalId: String(paymentId) },
      { gatewayPaymentId: String(paymentId) }
    ]
  });

  if (!subscriptionPayment) {
    return { ok: false, reason: "subscription_payment_not_found", gatewayPaymentId: String(paymentId) };
  }

  const payment = await mercadoPagoRequest(`/v1/payments/${paymentId}`, accessToken, {
    method: "GET"
  });

  const previousStatus = subscriptionPayment.status;
  const wasAlreadyPaid = ["approved", "paid"].includes(previousStatus) && Boolean(subscriptionPayment.paidAt);

  subscriptionPayment.status = payment.status || subscriptionPayment.status;
  subscriptionPayment.rawWebhookPayload = webhookPayload || subscriptionPayment.rawWebhookPayload;
  subscriptionPayment.rawPayment = payment;
  subscriptionPayment.rawLastStatusResponse = payment;
  subscriptionPayment.rawResponse = payment;
  subscriptionPayment.lastCheckedAt = new Date();
  subscriptionPayment.webhookReceivedAt = new Date();

  const isApproved = payment.status === "approved";
  if (!isApproved) {
    await subscriptionPayment.save();
    return {
      ok: true,
      activated: false,
      alreadyPaid: wasAlreadyPaid,
      status: subscriptionPayment.status,
      tenantId: subscriptionPayment.tenantId,
      saasPaymentId: subscriptionPayment._id,
      gatewayPaymentId: subscriptionPayment.gatewayPaymentId || subscriptionPayment.externalId || String(paymentId),
      amount: subscriptionPayment.amount
    };
  }

  const paidAt = getApprovedAt(payment);
  subscriptionPayment.status = "approved";
  subscriptionPayment.paidAt = subscriptionPayment.paidAt || paidAt;
  subscriptionPayment.amount = Number(payment.transaction_amount ?? subscriptionPayment.amount ?? 0);
  await subscriptionPayment.save();

  if (wasAlreadyPaid) {
    return {
      ok: true,
      activated: false,
      alreadyPaid: true,
      status: subscriptionPayment.status,
      tenantId: subscriptionPayment.tenantId,
      saasPaymentId: subscriptionPayment._id,
      gatewayPaymentId: subscriptionPayment.gatewayPaymentId || subscriptionPayment.externalId || String(paymentId),
      amount: subscriptionPayment.amount
    };
  }

  const periodStart = new Date();
  const periodEnd = addDays(periodStart, 30);
  const pricing = await calculateTenantSubscription({ tenantId: subscriptionPayment.tenantId });
  await TenantSubscription.findOneAndUpdate(
    {
      _id: subscriptionPayment.subscriptionId,
      tenantId: subscriptionPayment.tenantId
    },
    {
      $set: {
        status: "active",
        plan: PROFESSIONAL_PLAN,
        amount: pricing.totalAmount,
        baseAmount: pricing.baseAmount,
        additionalAmount: pricing.additionalAmount,
        enabledModules: pricing.enabledModules,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        lastPaymentAt: paidAt
      }
    },
    { new: true }
  );

  return {
    ok: true,
    activated: true,
    alreadyPaid: false,
    status: subscriptionPayment.status,
    tenantId: subscriptionPayment.tenantId,
    saasPaymentId: subscriptionPayment._id,
    gatewayPaymentId: subscriptionPayment.gatewayPaymentId || subscriptionPayment.externalId || String(paymentId),
    amount: subscriptionPayment.amount
  };
}

router.post("/webhooks/mercadopago", async (req, res) => {
  try {
    const paymentId = getWebhookPaymentId(req);
    if (!paymentId) {
      return res.status(400).json({
        ok: false,
        message: "paymentId não informado."
      });
    }

    const result = await syncSaasPaymentFromMercadoPago(paymentId, req.body || {});
    await auditSaas(req, {
      action: "saas_webhook",
      status: result.ok ? (result.reason ? "ignored" : "success") : "ignored",
      tenantId: result.tenantId,
      saasPaymentId: result.saasPaymentId,
      gatewayPaymentId: result.gatewayPaymentId || String(paymentId),
      amount: result.amount,
      message: result.reason || `Webhook SaaS processado com status ${result.status || "desconhecido"}.`,
      metadata: { activated: result.activated, alreadyPaid: result.alreadyPaid }
    });
    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("[SAAS WEBHOOK] erro", error.message);
    await auditSaas(req, {
      action: "saas_webhook",
      status: "failed",
      gatewayPaymentId: String(getWebhookPaymentId(req) || ""),
      message: error.message,
      metadata: { statusCode: error.statusCode || 500 }
    });
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : "Erro ao processar webhook SaaS."
    });
  }
});

module.exports = router;
