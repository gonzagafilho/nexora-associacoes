const crypto = require("crypto");

const Associate = require("../../models/Associate");
const Invoice = require("../../models/Invoice");
const PaymentGatewayTransaction = require("../../models/PaymentGatewayTransaction");
const TenantBillingSettings = require("../../models/TenantBillingSettings");
const {
  mercadoPagoRequest,
  resolveTenantCredentials
} = require("../mercadopago/tenantMercadoPagoService");

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCpf(value) {
  const cpf = cleanDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let digit = 9; digit < 11; digit += 1) {
    let sum = 0;
    for (let index = 0; index < digit; index += 1) {
      sum += Number(cpf[index]) * (digit + 1 - index);
    }
    const verifier = ((sum * 10) % 11) % 10;
    if (verifier !== Number(cpf[digit])) return false;
  }
  return true;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateAssociateForBoleto(associate) {
  const missing = [];
  if (!String(associate?.name || "").trim()) missing.push("nome");
  if (!isValidCpf(associate?.cpf)) missing.push("CPF válido");
  if (!isValidEmail(associate?.email)) missing.push("e-mail válido");
  if (!String(associate?.address || "").trim()) missing.push("endereço");
  if (!String(associate?.addressNumber || "").trim()) missing.push("número");
  if (!String(associate?.neighborhood || "").trim()) missing.push("bairro");
  if (!String(associate?.city || "").trim()) missing.push("cidade");
  if (!/^[A-Za-z]{2}$/.test(String(associate?.state || "").trim())) missing.push("UF");
  if (cleanDigits(associate?.zipCode).length !== 8) missing.push("CEP");
  if (missing.length) {
    throw createError(`Dados incompletos para gerar boleto: falta ${missing.join(", ")}.`);
  }
}

function calculateBoletoFee(originalAmount, settings) {
  const configuredFee = Math.max(0, Number(settings?.boletoFeeAmount || 0));
  const fee = settings?.boletoFeeMode === "percent"
    ? Number(originalAmount || 0) * (configuredFee / 100)
    : configuredFee;
  return roundMoney(fee);
}

function getExpirationDate(days) {
  const dueDays = Math.min(30, Math.max(1, Number(days || 3)));
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + dueDays);
  expiresAt.setHours(23, 59, 59, 999);
  return expiresAt;
}

function splitName(fullName) {
  const parts = String(fullName || "Associado").trim().split(/\s+/);
  return {
    firstName: parts.shift() || "Associado",
    lastName: parts.join(" ") || "Associado"
  };
}

function extractBoletoData(payment) {
  const transactionData = payment.point_of_interaction?.transaction_data || {};
  const transactionDetails = payment.transaction_details || {};
  const barcodeObject = payment.barcode || {};
  const boletoUrl =
    transactionDetails.external_resource_url ||
    transactionData.ticket_url ||
    payment.ticket_url ||
    "";
  const barcode =
    barcodeObject.content ||
    transactionDetails.barcode_content ||
    transactionData.barcode_content ||
    payment.barcode_content ||
    "";
  const digitableLine =
    payment.digitable_line ||
    transactionDetails.digitable_line ||
    transactionData.digitable_line ||
    barcode;
  return { boletoUrl, barcode, digitableLine };
}

async function createBoletoForInvoice(invoiceId, tenantId) {
  const [invoice, settings] = await Promise.all([
    Invoice.findOne({ _id: invoiceId, tenantId }),
    TenantBillingSettings.findOne({ tenantId }).lean()
  ]);

  if (!invoice) throw createError("Cobrança não encontrada", 404);
  if (invoice.status === "paid") throw createError("Cobrança já está paga", 409);
  if (!settings?.boletoEnabled) {
    throw createError("Boleto não está habilitado para esta associação", 403);
  }

  const associate = await Associate.findOne({
    _id: invoice.associateId,
    tenantId
  });
  if (!associate) throw createError("Associado não encontrado", 404);
  validateAssociateForBoleto(associate);
  const credentials = await resolveTenantCredentials(tenantId, "boleto");

  const originalAmount = roundMoney(invoice.amountCurrent);
  if (originalAmount <= 0) throw createError("Valor da cobrança inválido");

  const existing = await PaymentGatewayTransaction.findOne({
    tenantId,
    invoiceId: invoice._id,
    gateway: "mercadopago",
    method: "boleto",
    status: { $in: ["pending", "in_process", "approved", "paid"] }
  }).lean();
  if (existing) return { transaction: existing, reused: true };

  const feeAmount = calculateBoletoFee(originalAmount, settings);
  const totalAmount = roundMoney(originalAmount + feeAmount);
  const expiresAt = getExpirationDate(settings.boletoDueDays);
  const externalReference = `nexora_associacoes_boleto_${invoice._id}`;
  const { firstName, lastName } = splitName(associate.name);
  const paymentMethodId = credentials.boletoMethod || "bolbradesco";
  const body = {
    transaction_amount: totalAmount,
    description: invoice.description || `Cobrança ${invoice._id}`,
    payment_method_id: paymentMethodId,
    external_reference: externalReference,
    date_of_expiration: expiresAt.toISOString(),
    payer: {
      email: associate.email,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: "CPF",
        number: cleanDigits(associate.cpf)
      },
      address: {
        zip_code: cleanDigits(associate.zipCode),
        street_name: associate.address,
        street_number: associate.addressNumber,
        neighborhood: associate.neighborhood,
        city: associate.city,
        federal_unit: String(associate.state).toUpperCase()
      }
    },
    metadata: {
      tenant_id: String(tenantId),
      invoice_id: String(invoice._id),
      method: "boleto",
      original_amount: originalAmount,
      fee_amount: feeAmount
    }
  };
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${externalReference}:${totalAmount}`)
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
  const { boletoUrl, barcode, digitableLine } = extractBoletoData(payment);

  const transaction = await PaymentGatewayTransaction.create({
    tenantId,
    invoiceId: invoice._id,
    associateId: associate._id,
    gateway: "mercadopago",
    method: "boleto",
    externalId: String(payment.id),
    externalReference,
    status: payment.status || "pending",
    amount: totalAmount,
    originalAmount,
    feeAmount,
    totalAmount,
    boletoUrl,
    ticketUrl: boletoUrl,
    barcode,
    digitableLine,
    expiresAt: payment.date_of_expiration
      ? new Date(payment.date_of_expiration)
      : expiresAt,
    rawCreateResponse: payment,
    rawPayment: payment,
    rawLastStatusResponse: payment,
    lastCheckedAt: new Date()
  });

  invoice.boletoPaymentId = String(payment.id);
  await invoice.save();
  console.log(
    "[MP BOLETO] criado",
    String(payment.id),
    `original=${originalAmount} taxa=${feeAmount} total=${totalAmount}`
  );

  return {
    transaction: transaction.toObject(),
    boleto: {
      externalId: String(payment.id),
      status: payment.status || "pending",
      boletoUrl,
      barcode,
      digitableLine,
      expiresAt: transaction.expiresAt,
      originalAmount,
      feeAmount,
      totalAmount
    },
    reused: false
  };
}

module.exports = {
  calculateBoletoFee,
  cleanDigits,
  createBoletoForInvoice,
  extractBoletoData,
  isValidCpf,
  isValidEmail,
  validateAssociateForBoleto
};
