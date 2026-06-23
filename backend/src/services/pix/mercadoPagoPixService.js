const crypto = require("crypto");

const PaymentGatewayTransaction = require("../../models/PaymentGatewayTransaction");
const Invoice = require("../../models/Invoice");
const Associate = require("../../models/Associate");
const InvoicePix = require("../../models/InvoicePix");
const Payment = require("../../models/Payment");
const {
  mercadoPagoRequest,
  resolveTenantCredentials
} = require("../mercadopago/tenantMercadoPagoService");

function getAssociateEmail(associate) {
  return associate?.email || process.env.BOLEPIX_DEFAULT_EMAIL || "associado@nexora.local";
}

async function createPixForInvoice(invoiceId, tenantId) {
  const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
  if (!invoice) throw new Error("Cobrança não encontrada");

  const associate = await Associate.findOne({
    _id: invoice.associateId,
    tenantId
  });
  if (!associate) throw new Error("Associado não encontrado");
  if (!invoice.amountCurrent || invoice.amountCurrent <= 0) {
    throw new Error("Valor da cobrança inválido");
  }

  const existing = await PaymentGatewayTransaction.findOne({
    tenantId,
    invoiceId: invoice._id,
    gateway: "mercadopago",
    $or: [{ method: "pix" }, { method: { $exists: false } }],
    status: { $in: ["pending", "in_process", "approved", "paid"] }
  }).lean();
  if (existing) return existing;

  const credentials = await resolveTenantCredentials(tenantId, "pix");
  const externalReference = `nexora_associacoes_invoice_${invoice._id}`;
  const body = {
    transaction_amount: Number(invoice.amountCurrent.toFixed(2)),
    description: invoice.description || `Cobrança ${invoice._id}`,
    payment_method_id: "pix",
    external_reference: externalReference,
    payer: {
      email: getAssociateEmail(associate),
      first_name: associate.name || "Associado"
    }
  };
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(externalReference)
    .digest("hex");
  const payment = await mercadoPagoRequest(
    "/v1/payments",
    credentials.accessToken,
    {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body)
    }
  );
  const point = payment.point_of_interaction?.transaction_data || {};

  const tx = await PaymentGatewayTransaction.create({
    tenantId,
    invoiceId: invoice._id,
    associateId: associate._id,
    gateway: "mercadopago",
    method: "pix",
    externalId: String(payment.id),
    externalReference,
    status: payment.status || "pending",
    amount: invoice.amountCurrent,
    originalAmount: invoice.amountCurrent,
    feeAmount: 0,
    totalAmount: invoice.amountCurrent,
    qrCode: point.qr_code,
    qrCodeBase64: point.qr_code_base64,
    ticketUrl: point.ticket_url,
    rawCreateResponse: payment,
    rawPayment: payment,
    rawLastStatusResponse: payment,
    lastCheckedAt: new Date()
  });
  const invoicePix = await InvoicePix.create({
    tenantId,
    invoiceId: invoice._id,
    gateway: "mercadopago",
    gatewayPaymentId: String(payment.id),
    qrCodeText: point.qr_code,
    qrCodeImageUrl: point.qr_code_base64
      ? `data:image/png;base64,${point.qr_code_base64}`
      : "",
    pixCopyPaste: point.qr_code,
    amount: invoice.amountCurrent,
    expiresAt: invoice.dueDate,
    status: "active"
  });

  invoice.pixPaymentId = String(payment.id);
  await invoice.save();

  return {
    transaction: tx.toObject(),
    invoicePix: invoicePix.toObject()
  };
}

async function getPayment(paymentId, tenantId, method = "pix", options = {}) {
  const credentials = await resolveTenantCredentials(tenantId, method, options);
  return mercadoPagoRequest(
    `/v1/payments/${paymentId}`,
    credentials.accessToken,
    { method: "GET" }
  );
}

function getApprovedAt(payment) {
  const approvedAt = payment.date_approved
    ? new Date(payment.date_approved)
    : new Date();
  return Number.isNaN(approvedAt.getTime()) ? new Date() : approvedAt;
}

async function syncPaymentStatus(paymentId, webhookPayload = null) {
  const tx = await PaymentGatewayTransaction.findOne({
    gateway: "mercadopago",
    externalId: String(paymentId)
  });
  if (!tx) return { ok: false, reason: "transaction_not_found" };

  const payment = await getPayment(
    paymentId,
    tx.tenantId,
    tx.method || "pix",
    { allowDisabled: true }
  );
  console.log("[MP WEBHOOK] status Mercado Pago", payment.status, payment.status_detail || "");

  const method = tx.method || (
    payment.payment_method_id && payment.payment_method_id !== "pix"
      ? "boleto"
      : "pix"
  );
  const transactionData = payment.point_of_interaction?.transaction_data || {};
  const transactionDetails = payment.transaction_details || {};
  const barcode =
    payment.barcode?.content ||
    transactionDetails.barcode_content ||
    transactionData.barcode_content;

  tx.method = method;
  tx.status = payment.status || tx.status;
  tx.rawPayment = payment;
  tx.rawLastStatusResponse = payment;
  tx.lastCheckedAt = new Date();

  if (method === "boleto") {
    tx.boletoUrl =
      transactionDetails.external_resource_url ||
      transactionData.ticket_url ||
      tx.boletoUrl;
    tx.ticketUrl = tx.boletoUrl || tx.ticketUrl;
    tx.barcode = barcode || tx.barcode;
    tx.digitableLine =
      payment.digitable_line ||
      transactionDetails.digitable_line ||
      transactionData.digitable_line ||
      barcode ||
      tx.digitableLine;
    if (payment.date_of_expiration) {
      tx.expiresAt = new Date(payment.date_of_expiration);
    }
  }

  if (webhookPayload) {
    tx.rawWebhook = webhookPayload;
    tx.rawWebhookPayload = webhookPayload;
    tx.webhookReceivedAt = new Date();
  }

  let alreadyPaid = false;
  const isPaid =
    ["approved", "accredited"].includes(payment.status) ||
    payment.status_detail === "accredited";

  if (isPaid) {
    const paidAt = getApprovedAt(payment);
    const paidAmount = Number(
      payment.transaction_amount ?? tx.totalAmount ?? tx.amount ?? 0
    );
    const originalAmount = Number(tx.originalAmount ?? tx.amount ?? paidAmount);
    const feeAmount = Number(
      tx.feeAmount ?? Math.max(0, paidAmount - originalAmount)
    );
    const paymentExternalId = String(payment.id);

    tx.status = method === "boleto" ? "paid" : "approved";
    tx.paidAt = paidAt;
    tx.originalAmount = originalAmount;
    tx.feeAmount = feeAmount;
    tx.totalAmount = paidAmount;

    const paidInvoice = await Invoice.findOneAndUpdate(
      {
        _id: tx.invoiceId,
        tenantId: tx.tenantId,
        status: { $ne: "paid" }
      },
      {
        $set: {
          status: "paid",
          paidAt,
          paidAmount,
          paymentGateway: "mercadopago",
          paymentMethod: method,
          paymentExternalId
        }
      },
      { new: true }
    );

    if (method === "pix") {
      await InvoicePix.updateOne(
        { tenantId: tx.tenantId, invoiceId: tx.invoiceId },
        {
          $set: {
            status: "paid",
            paidAt,
            paidAmount,
            paymentGateway: "mercadopago",
            paymentExternalId
          }
        }
      );
    }

    const paymentAssociateId = paidInvoice?.associateId || tx.associateId;
    if (paymentAssociateId) {
      await Payment.updateOne(
        {
          gateway: "mercadopago",
          gatewayPaymentId: paymentExternalId
        },
        {
          $setOnInsert: {
            tenantId: tx.tenantId,
            invoiceId: tx.invoiceId,
            associateId: paymentAssociateId,
            gateway: "mercadopago",
            method,
            gatewayPaymentId: paymentExternalId,
            amountPaid: paidAmount,
            originalAmount,
            feeAmount,
            totalAmount: paidAmount,
            paidAt,
            rawPayload: payment
          }
        },
        { upsert: true }
      );
    }

    if (paidInvoice) {
      console.log(`[MP WEBHOOK] invoice paga (${method})`, String(paidInvoice._id));
    } else {
      alreadyPaid = true;
      console.log(`[MP WEBHOOK] já estava paga (${method})`, String(tx.invoiceId));
    }
  }

  await tx.save();
  return { ok: true, alreadyPaid, method, transaction: tx, payment };
}

async function handleWebhook(payload) {
  console.log("[MP WEBHOOK] recebido", payload?.type || payload?.action || "sem tipo");
  const isPaymentEvent =
    payload?.type === "payment" ||
    String(payload?.action || "").startsWith("payment.");
  if (!isPaymentEvent) {
    return { ok: true, ignored: true, reason: "unsupported_event" };
  }

  const paymentId = payload?.data?.id || payload?.id || payload?.resource;
  if (!paymentId) {
    return { ok: false, reason: "payment_id_not_found", payload };
  }

  console.log("[MP WEBHOOK] payment id", String(paymentId));
  await PaymentGatewayTransaction.updateOne(
    { gateway: "mercadopago", externalId: String(paymentId) },
    {
      $set: {
        rawWebhook: payload,
        rawWebhookPayload: payload,
        webhookReceivedAt: new Date()
      }
    }
  );
  return syncPaymentStatus(paymentId, payload);
}

module.exports = {
  createPixForInvoice,
  getPayment,
  syncPaymentStatus,
  handleWebhook
};
