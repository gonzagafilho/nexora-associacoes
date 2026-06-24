const FinancialTransaction = require("../../models/FinancialTransaction");

function getInvoicePaidAmount(invoice, fallbackAmount) {
  return Number(invoice?.paidAmount ?? invoice?.amountCurrent ?? invoice?.amountOriginal ?? fallbackAmount ?? 0);
}

async function createIncomeForPaidInvoice(invoice, options = {}) {
  try {
    if (!invoice?._id || !invoice?.tenantId) return null;

    const existing = await FinancialTransaction.findOne({
      tenantId: invoice.tenantId,
      referenceType: "invoice",
      referenceId: invoice._id
    }).lean();

    if (existing) return existing;

    const paidAt = invoice.paidAt || options.paidAt || new Date();
    const amount = getInvoicePaidAmount(invoice, options.amount);
    if (!amount || amount <= 0) return null;

    return FinancialTransaction.create({
      tenantId: invoice.tenantId,
      type: "income",
      category: "Mensalidades",
      description: "Recebimento de mensalidade",
      amount,
      dueDate: invoice.dueDate || paidAt,
      paidAt,
      status: "paid",
      paymentMethod: invoice.paymentMethod || options.paymentMethod || "other",
      referenceType: "invoice",
      referenceId: invoice._id,
      notes: options.notes || "Entrada criada automaticamente pela baixa da cobrança."
    });
  } catch (error) {
    console.error("[financial:invoice-income]", error.message);
    return null;
  }
}

module.exports = {
  createIncomeForPaidInvoice
};
