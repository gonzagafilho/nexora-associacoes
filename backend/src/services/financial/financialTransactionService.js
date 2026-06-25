const FinancialTransaction = require("../../models/FinancialTransaction");
const { publishOsEvent } = require("../../os/osEventPublisher");

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

    const transaction = await FinancialTransaction.create({
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

    await publishOsEvent("financial.transaction.created", {
      tenantId: transaction.tenantId,
      userId: null,
      module: "financial",
      action: "created",
      entityId: transaction._id,
      entityType: "FinancialTransaction",
      payload: {
        type: transaction.type,
        status: transaction.status,
        amount: Number(transaction.amount || 0),
        referenceType: transaction.referenceType
      }
    }, { tenantId: transaction.tenantId, userId: null });

    if (transaction.status === "paid") {
      await publishOsEvent("financial.transaction.paid", {
        tenantId: transaction.tenantId,
        userId: null,
        module: "financial",
        action: "paid",
        entityId: transaction._id,
        entityType: "FinancialTransaction",
        payload: {
          type: transaction.type,
          status: transaction.status,
          amount: Number(transaction.amount || 0)
        }
      }, { tenantId: transaction.tenantId, userId: null });
    }

    return transaction;
  } catch (error) {
    console.error("[financial:invoice-income]", error.message);
    return null;
  }
}

module.exports = {
  createIncomeForPaidInvoice
};
