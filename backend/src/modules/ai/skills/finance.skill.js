const Invoice = require("../../../models/Invoice");
const mercadoPagoPixService = require("../../../services/pix/mercadoPagoPixService");
const BaseSkill = require("./base.skill");

class FinanceSkill extends BaseSkill {
  constructor() {
    super({
      name: "finance",
      description: "Skills financeiras para cobrança, consulta e listagem.",
      version: "4.1.0",
      permissions: ["module:memberbilling"],
      confirmationRequired: false,
      active: true
    });
  }

  validate(action, payload = {}) {
    if (!action) {
      const error = new Error("Ação da skill financeira não informada.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "createBolePix" && !payload.associateId) {
      const error = new Error("associateId é obrigatório para finance.createBolePix.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "getInvoice" && !payload.invoiceId) {
      const error = new Error("invoiceId é obrigatório para finance.getInvoice.");
      error.statusCode = 400;
      throw error;
    }
    return { ok: true };
  }

  async execute(action, payload = {}, context = {}) {
    this.validate(action, payload, context);

    if (action === "createBolePix") return this.createBolePix(payload, context);
    if (action === "getInvoice") return this.getInvoice(payload, context);
    if (action === "listInvoices") return this.listInvoices(payload, context);

    const error = new Error(`Ação financeira inválida: ${action}`);
    error.statusCode = 404;
    throw error;
  }

  async createBolePix(payload, context) {
    const invoice = await Invoice.create({
      tenantId: context.tenantId,
      associateId: payload.associateId,
      type: payload.type || "manual",
      description: payload.description || "Cobrança via Skill finance.createBolePix",
      amountOriginal: Number(payload.amountOriginal || payload.amount || 0),
      discountValue: Number(payload.discountValue || 0),
      amountCurrent: Number(payload.amountOriginal || payload.amount || 0),
      dueDate: payload.dueDate ? new Date(payload.dueDate) : new Date(),
      lateFeeType: payload.lateFeeType || "fixed",
      lateFeeValue: Number(payload.lateFeeValue || 0),
      dailyInterestType: payload.dailyInterestType || "percent",
      dailyInterestValue: Number(payload.dailyInterestValue || 0),
      status: "pending",
      metadata: {
        ...(payload.metadata || {}),
        source: "skills-engine",
        skill: "finance.createBolePix"
      }
    });

    if (!invoice.amountOriginal || invoice.amountOriginal <= 0) {
      const error = new Error("Valor da cobrança deve ser maior que zero.");
      error.statusCode = 400;
      throw error;
    }

    const pixResult = await mercadoPagoPixService.createPixForInvoice(invoice._id, context.tenantId);

    return {
      skill: "finance.createBolePix",
      invoiceId: String(invoice._id),
      status: invoice.status,
      amountCurrent: invoice.amountCurrent,
      dueDate: invoice.dueDate,
      pix: {
        gatewayPaymentId: pixResult?.invoicePix?.gatewayPaymentId || pixResult?.transaction?.externalId || "",
        qrCode: pixResult?.invoicePix?.qrCodeText || pixResult?.transaction?.qrCode || "",
        copyPaste: pixResult?.invoicePix?.pixCopyPaste || pixResult?.transaction?.qrCode || "",
        expiresAt: pixResult?.invoicePix?.expiresAt || pixResult?.transaction?.expiresAt || null
      }
    };
  }

  async getInvoice(payload, context) {
    const invoice = await Invoice.findOne({ _id: payload.invoiceId, tenantId: context.tenantId })
      .populate("associateId", "name cpf phone email")
      .lean();

    if (!invoice) {
      const error = new Error("Cobrança não encontrada.");
      error.statusCode = 404;
      throw error;
    }

    return {
      skill: "finance.getInvoice",
      invoice
    };
  }

  async listInvoices(payload, context) {
    const query = { tenantId: context.tenantId };
    if (payload.status) query.status = payload.status;
    if (payload.associateId) query.associateId = payload.associateId;
    if (payload.type) query.type = payload.type;
    const limit = Math.min(Math.max(Number(payload.limit || 20), 1), 200);

    const invoices = await Invoice.find(query)
      .populate("associateId", "name cpf phone email")
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      skill: "finance.listInvoices",
      count: invoices.length,
      invoices
    };
  }
}

module.exports = FinanceSkill;
