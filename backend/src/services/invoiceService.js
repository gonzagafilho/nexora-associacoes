const Invoice = require("../models/Invoice");
const Associate = require("../models/Associate");
const TenantBillingSettings = require("../models/TenantBillingSettings");

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateAmountCurrent(invoice) {
  const today = startOfDay(new Date());
  const dueDate = startOfDay(invoice.dueDate);

  let amount = Number(invoice.amountOriginal || 0) - Number(invoice.discountValue || 0);

  if (today <= dueDate) {
    return Math.max(0, Number(amount.toFixed(2)));
  }

  const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

  const lateFee =
    invoice.lateFeeType === "percent"
      ? amount * (Number(invoice.lateFeeValue || 0) / 100)
      : Number(invoice.lateFeeValue || 0);

  const dailyInterestBase =
    invoice.dailyInterestType === "percent"
      ? amount * (Number(invoice.dailyInterestValue || 0) / 100)
      : Number(invoice.dailyInterestValue || 0);

  amount = amount + lateFee + dailyInterestBase * diffDays;

  return Math.max(0, Number(amount.toFixed(2)));
}

async function buildInvoicePayload({ tenantId, associateId, body }) {
  const associate = await Associate.findOne({ _id: associateId, tenantId });

  if (!associate) {
    const error = new Error("Associado não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const settings = await TenantBillingSettings.findOne({ tenantId });

  const amountOriginal = Number(body.amountOriginal || body.amount || settings?.defaultMonthlyAmount || 0);

  if (!amountOriginal || amountOriginal <= 0) {
    const error = new Error("Valor da cobrança deve ser maior que zero.");
    error.statusCode = 400;
    throw error;
  }

  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date();

  const payload = {
    tenantId,
    associateId,
    type: body.type || "monthly",
    description: body.description || "Mensalidade",
    amountOriginal,
    discountValue: Number(body.discountValue || settings?.defaultDiscountValue || 0),
    dueDate,
    lateFeeType: body.lateFeeType || settings?.defaultLateFeeType || "fixed",
    lateFeeValue: Number(body.lateFeeValue ?? settings?.defaultLateFeeValue ?? 0),
    dailyInterestType: body.dailyInterestType || settings?.defaultDailyInterestType || "percent",
    dailyInterestValue: Number(body.dailyInterestValue ?? settings?.defaultDailyInterestValue ?? 0),
    status: body.status || "pending",
    metadata: body.metadata || {}
  };

  payload.amountCurrent = calculateAmountCurrent(payload);

  return payload;
}

async function refreshInvoiceAmount(invoice) {
  if (!invoice || ["paid", "cancelled"].includes(invoice.status)) return invoice;

  const amountCurrent = calculateAmountCurrent(invoice);
  const dueDate = startOfDay(invoice.dueDate);
  const today = startOfDay(new Date());

  invoice.amountCurrent = amountCurrent;

  if (invoice.status === "pending" && today > dueDate) {
    invoice.status = "overdue";
  }

  await invoice.save();
  return invoice;
}

module.exports = {
  calculateAmountCurrent,
  buildInvoicePayload,
  refreshInvoiceAmount
};
