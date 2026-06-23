const crypto = require("crypto");

const SaasSubscriptionPayment = require("../models/SaasSubscriptionPayment");
const Tenant = require("../models/Tenant");
const TenantSubscription = require("../models/TenantSubscription");
const { mercadoPagoRequest } = require("./mercadopago/tenantMercadoPagoService");

const PROFESSIONAL_PLAN = "professional";
const PROFESSIONAL_AMOUNT = 49.9;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_EXPIRATION_MINUTES = 30;
const GRACE_DAYS = 7;

let renewalTimer = null;

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function getBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "https://associacoes.nexoracloud.com.br"
  ).replace(/\/+$/, "");
}

function getPayerEmail(tenant) {
  const fallback = process.env.SAAS_DEFAULT_PAYER_EMAIL || "assinatura@nexoracloud.com.br";
  const email = String(tenant?.email || "").trim().toLowerCase();
  if (!email || email.endsWith(".local")) return fallback;
  return email;
}

function logRenewal({ tenantId, subscriptionId, paymentId = "-", status }) {
  console.log(
    `[SaaS Renewal]\nTenant: ${tenantId}\nSubscription: ${subscriptionId}\nPayment: ${paymentId}\nStatus: ${status}`
  );
}

async function hasApprovedPayment(subscription) {
  return Boolean(await SaasSubscriptionPayment.findOne({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    status: { $in: ["approved", "paid"] },
    paidAt: { $gte: subscription.nextBillingDate }
  }).lean());
}

async function findPendingPayment(subscription, now) {
  return SaasSubscriptionPayment.findOne({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    gateway: "mercadopago",
    method: "pix",
    plan: PROFESSIONAL_PLAN,
    status: { $in: ["pending", "in_process"] },
    expiresAt: { $gt: now }
  }).lean();
}

async function createRenewalPayment(subscription, now) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Mercado Pago da plataforma não configurado.");
  }

  const tenant = await Tenant.findById(subscription.tenantId).lean();
  const externalReference = `nexora_saas_renewal_${subscription.tenantId}_${Date.now()}`;
  const expiresAt = addMinutes(now, PAYMENT_EXPIRATION_MINUTES);
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(externalReference)
    .digest("hex");

  const payment = await mercadoPagoRequest("/v1/payments", accessToken, {
    method: "POST",
    headers: { "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      transaction_amount: PROFESSIONAL_AMOUNT,
      description: "NEXORA Gestão Inteligente - Renovação Plano Professional",
      payment_method_id: "pix",
      external_reference: externalReference,
      date_of_expiration: expiresAt.toISOString(),
      notification_url: `${getBaseUrl()}/api/subscription/webhooks/mercadopago`,
      payer: {
        email: getPayerEmail(tenant)
      }
    })
  });

  const transactionData = payment.point_of_interaction?.transaction_data || {};
  const qrCode = transactionData.qr_code || "";

  return SaasSubscriptionPayment.create({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    plan: PROFESSIONAL_PLAN,
    gateway: "mercadopago",
    method: "pix",
    externalId: String(payment.id),
    gatewayPaymentId: String(payment.id),
    externalReference,
    status: payment.status || "pending",
    amount: PROFESSIONAL_AMOUNT,
    qrCode,
    qrCodeBase64: transactionData.qr_code_base64 || "",
    copyPaste: qrCode,
    ticketUrl: transactionData.ticket_url,
    expiresAt,
    rawCreateResponse: payment,
    rawResponse: payment,
    rawPayment: payment,
    rawLastStatusResponse: payment,
    lastCheckedAt: now
  });
}

async function markOverdueIfNeeded(subscription, now) {
  const overdueLimit = addDays(new Date(subscription.nextBillingDate), GRACE_DAYS);
  if (overdueLimit >= startOfDay(now)) {
    return false;
  }

  if (await hasApprovedPayment(subscription)) {
    logRenewal({
      tenantId: subscription.tenantId,
      subscriptionId: subscription._id,
      status: "ignorado"
    });
    return false;
  }

  await TenantSubscription.findOneAndUpdate(
    { _id: subscription._id, tenantId: subscription.tenantId, status: "active" },
    { $set: { status: "overdue" } }
  );

  logRenewal({
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    status: "overdue"
  });
  return true;
}

async function runSubscriptionRenewalJob(options = {}) {
  const now = options.now || new Date();
  const dueDate = endOfDay(now);
  const subscriptions = await TenantSubscription.find({
    status: "active",
    nextBillingDate: { $lte: dueDate }
  });

  const summary = {
    generated: 0,
    skipped: 0,
    alreadyPending: 0,
    overdue: 0,
    errors: 0
  };

  for (const subscription of subscriptions) {
    try {
      const pendingPayment = await findPendingPayment(subscription, now);
      if (pendingPayment) {
        summary.alreadyPending += 1;
        logRenewal({
          tenantId: subscription.tenantId,
          subscriptionId: subscription._id,
          paymentId: pendingPayment.gatewayPaymentId || pendingPayment.externalId || pendingPayment._id,
          status: "já possui cobrança"
        });
      } else {
        const saved = await createRenewalPayment(subscription, now);
        summary.generated += 1;
        logRenewal({
          tenantId: subscription.tenantId,
          subscriptionId: subscription._id,
          paymentId: saved.gatewayPaymentId || saved.externalId || saved._id,
          status: "gerado"
        });
      }

      const markedOverdue = await markOverdueIfNeeded(subscription, now);
      if (markedOverdue) {
        summary.overdue += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logRenewal({
        tenantId: subscription.tenantId,
        subscriptionId: subscription._id,
        status: `vencido: ${error.message}`
      });
    }
  }

  return summary;
}

function millisecondsUntilNextRun(now = new Date()) {
  const nextRun = new Date(now);
  nextRun.setHours(0, 10, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  return nextRun.getTime() - now.getTime();
}

function startSubscriptionRenewalSchedule() {
  if (renewalTimer) return renewalTimer;

  const scheduleNextRun = () => {
    renewalTimer = setTimeout(async () => {
      try {
        await runSubscriptionRenewalJob();
      } catch (error) {
        console.error("[SaaS Renewal] erro geral", error);
      } finally {
        scheduleNextRun();
      }
    }, millisecondsUntilNextRun());
    renewalTimer.unref?.();
  };

  scheduleNextRun();
  return renewalTimer;
}

function stopSubscriptionRenewalSchedule() {
  if (renewalTimer) {
    clearTimeout(renewalTimer);
    renewalTimer = null;
  }
}

module.exports = {
  PROFESSIONAL_AMOUNT,
  PROFESSIONAL_PLAN,
  millisecondsUntilNextRun,
  runSubscriptionRenewalJob,
  startSubscriptionRenewalSchedule,
  stopSubscriptionRenewalSchedule
};
