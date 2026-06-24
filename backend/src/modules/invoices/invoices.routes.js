const express = require("express");
const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const Invoice = require("../../models/Invoice");
const Associate = require("../../models/Associate");
const Tenant = require("../../models/Tenant");
const TenantBranding = require("../../models/TenantBranding");
const TenantBillingSettings = require("../../models/TenantBillingSettings");
const InvoicePix = require("../../models/InvoicePix");
const PaymentGatewayTransaction = require("../../models/PaymentGatewayTransaction");
const {
  buildInvoicePayload,
  refreshInvoiceAmount
} = require("../../services/invoiceService");
const {
  createBoletoForInvoice
} = require("../../services/boleto/mercadoPagoBoletoService");
const mercadoPagoPixService = require("../../services/pix/mercadoPagoPixService");
const { generateInvoicePdf } = require("../../services/pdfService");
const { createBillingAuditLog } = require("../../services/audit/billingAuditService");
const { createIncomeForPaidInvoice } = require("../../services/financial/financialTransactionService");

function auditAssociateBilling(req, data) {
  return createBillingAuditLog({
    req,
    scope: "associate",
    action: "associate_invoice_manual",
    ...data
  });
}

async function createPdfForInvoice(invoice, tenantId) {
  const [associate, tenant, branding, billingSettings, invoicePix, boletoTransaction] =
    await Promise.all([
      Associate.findOne({ _id: invoice.associateId, tenantId }),
      Tenant.findById(tenantId),
      TenantBranding.findOne({ tenantId }).lean(),
      TenantBillingSettings.findOne({ tenantId }).lean(),
      InvoicePix.findOne({ tenantId, invoiceId: invoice._id }).sort({ createdAt: -1 }).lean(),
      PaymentGatewayTransaction.findOne({
        tenantId,
        invoiceId: invoice._id,
        gateway: "mercadopago",
        method: "boleto"
      }).sort({ createdAt: -1 }).lean()
    ]);

  if (!associate || !tenant) {
    const error = new Error("Dados da associação ou do associado não encontrados.");
    error.statusCode = 404;
    throw error;
  }

  const pdf = await generateInvoicePdf({
    invoice,
    associate,
    tenant,
    branding: branding || {},
    billingSettings: billingSettings || {},
    invoicePix,
    boletoTransaction
  });

  invoice.pdfUrl = pdf.relativePath;
  await invoice.save();
  return pdf;
}

function formatInvoicePix(result) {
  if (!result) return null;
  const invoicePix = result.invoicePix || null;
  const transaction = result.transaction || result;
  return {
    gatewayPaymentId: invoicePix?.gatewayPaymentId || transaction.externalId || "",
    qrCode: invoicePix?.qrCodeText || transaction.qrCode || "",
    qrCodeBase64: transaction.qrCodeBase64 || "",
    copyPaste: invoicePix?.pixCopyPaste || transaction.qrCode || "",
    amount: invoicePix?.amount || transaction.amount || transaction.totalAmount || 0,
    expiresAt: invoicePix?.expiresAt || transaction.expiresAt || null,
    status: invoicePix?.status || transaction.status || ""
  };
}

const router = express.Router();
const memberBillingAccess = [auth, requireModule("memberbilling")];

router.post("/admin/associates/:associateId/generate", memberBillingAccess, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const payload = await buildInvoicePayload({
      tenantId,
      associateId: req.params.associateId,
      body: {
        ...req.body,
        type: req.body?.type || "manual",
        metadata: {
          ...(req.body?.metadata || {}),
          source: "individual-admin",
          reference: req.body?.reference || req.body?.description || "cobranca-individual",
          generatedBy: req.user.id
        }
      }
    });

    payload.clientId = req.params.associateId;
    payload.competence = req.body?.competence || `individual-${Date.now()}`;

    const invoice = await Invoice.create(payload);
    let pix = null;
    let pdf = null;

    if (req.body?.generatePix) {
      pix = formatInvoicePix(await mercadoPagoPixService.createPixForInvoice(invoice._id, tenantId));
    }

    if (req.body?.generatePdf) {
      pdf = await createPdfForInvoice(invoice, tenantId);
    }

    await auditAssociateBilling(req, {
      status: "success",
      tenantId,
      invoiceId: invoice._id,
      associateId: invoice.associateId,
      gatewayPaymentId: pix?.gatewayPaymentId || "",
      amount: invoice.amountCurrent,
      message: "Cobrança individual de associado gerada.",
      metadata: { generatePix: Boolean(req.body?.generatePix), generatePdf: Boolean(req.body?.generatePdf) }
    });

    return res.status(201).json({
      ok: true,
      invoiceId: invoice._id,
      associateId: invoice.associateId,
      amount: invoice.amountCurrent,
      dueDate: invoice.dueDate,
      status: invoice.status,
      pix,
      pdfUrl: pdf?.relativePath || invoice.pdfUrl || null,
      pdfDocumentId: pdf?.documentId || null
    });
  } catch (error) {
    console.error("[invoice:individual:generate]", error.message);
    await auditAssociateBilling(req, {
      status: "failed",
      tenantId: req.user?.tenantId,
      associateId: req.params.associateId,
      amount: Number(req.body?.amount || req.body?.amountOriginal || 0) || undefined,
      message: error.message,
      metadata: { statusCode: error.statusCode || 500 }
    });
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Erro ao gerar cobrança individual."
    });
  }
});

router.post("/", memberBillingAccess, async (req, res) => {
  try {
    const payload = await buildInvoicePayload({
      tenantId: req.user.tenantId,
      associateId: req.body.associateId,
      body: req.body
    });

    const invoice = await Invoice.create(payload);

    return res.status(201).json({ ok: true, invoice });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Erro ao criar cobrança."
    });
  }
});

router.post("/:id/boleto/mercadopago", memberBillingAccess, async (req, res) => {
  try {
    const result = await createBoletoForInvoice(
      req.params.id,
      req.user.tenantId
    );

    return res.json({
      ok: true,
      gateway: "mercadopago",
      method: "boleto",
      ...result
    });
  } catch (error) {
    console.error("[boleto:create]", error.message);
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.message || "Erro ao gerar boleto."
    });
  }
});

router.get("/", memberBillingAccess, async (req, res) => {
  const query = { tenantId: req.user.tenantId };

  if (req.query.status) query.status = req.query.status;
  if (req.query.associateId) query.associateId = req.query.associateId;
  if (req.query.type) query.type = req.query.type;

  if (req.query.from || req.query.to) {
    query.dueDate = {};
    if (req.query.from) query.dueDate.$gte = new Date(req.query.from);
    if (req.query.to) query.dueDate.$lte = new Date(req.query.to);
  }

  const invoices = await Invoice.find(query)
    .populate("associateId", "name cpf phone whatsapp email address addressNumber neighborhood city state zipCode")
    .sort({ dueDate: -1, createdAt: -1 })
    .limit(300);

  for (const invoice of invoices) {
    await refreshInvoiceAmount(invoice);
  }

  return res.json({ ok: true, invoices });
});

router.get("/:id", memberBillingAccess, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId
  }).populate("associateId", "name cpf phone whatsapp email address addressNumber neighborhood city state zipCode");

  if (!invoice) {
    return res.status(404).json({ ok: false, message: "Cobrança não encontrada." });
  }

  await refreshInvoiceAmount(invoice);

  return res.json({ ok: true, invoice });
});

router.put("/:id", memberBillingAccess, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId
  });

  if (!invoice) {
    return res.status(404).json({ ok: false, message: "Cobrança não encontrada." });
  }

  if (invoice.status === "paid") {
    return res.status(409).json({ ok: false, message: "Cobrança paga não pode ser alterada." });
  }

  const allowed = [
    "type",
    "description",
    "amountOriginal",
    "discountValue",
    "dueDate",
    "lateFeeType",
    "lateFeeValue",
    "dailyInterestType",
    "dailyInterestValue",
    "status",
    "metadata"
  ];

  for (const field of allowed) {
    if (req.body[field] !== undefined) invoice[field] = req.body[field];
  }

  await refreshInvoiceAmount(invoice);

  return res.json({ ok: true, invoice });
});

router.delete("/:id", memberBillingAccess, async (req, res) => {
  const invoice = await Invoice.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.user.tenantId,
      status: { $ne: "paid" }
    },
    {
      status: "cancelled",
      cancelledAt: new Date()
    },
    { new: true }
  );

  if (!invoice) {
    return res.status(404).json({
      ok: false,
      message: "Cobrança não encontrada ou já paga."
    });
  }

  return res.json({ ok: true, invoice });
});

router.post("/:id/mark-paid", memberBillingAccess, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId
  });

  if (!invoice) {
    return res.status(404).json({ ok: false, message: "Cobrança não encontrada." });
  }

  invoice.status = "paid";
  invoice.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  invoice.paidAmount = Number(req.body.amountPaid || invoice.amountCurrent || invoice.amountOriginal || 0);
  invoice.paymentMethod = "manual";

  await invoice.save();
  await createIncomeForPaidInvoice(invoice, { amount: invoice.paidAmount, paidAt: invoice.paidAt, paymentMethod: "other" });

  return res.json({ ok: true, invoice });
});

router.post("/generate-monthly", memberBillingAccess, async (req, res) => {
  const TenantBillingSettings = require("../../models/TenantBillingSettings");

  const tenantId = req.user.tenantId;
  const settings = await TenantBillingSettings.findOne({ tenantId });

  if (!settings || !settings.defaultMonthlyAmount) {
    return res.status(400).json({
      ok: false,
      message: "Configuração financeira padrão não encontrada."
    });
  }

  const month = Number(req.body.month || new Date().getMonth() + 1);
  const year = Number(req.body.year || new Date().getFullYear());

  const dueDate = new Date(year, month - 1, settings.defaultDueDay);

  const associates = await Associate.find({ tenantId, status: "active" });

  const created = [];

  for (const associate of associates) {
    const exists = await Invoice.findOne({
      tenantId,
      associateId: associate._id,
      type: "monthly",
      "metadata.month": month,
      "metadata.year": year
    });

    if (exists) continue;

    const invoice = await Invoice.create({
      tenantId,
      associateId: associate._id,
      type: "monthly",
      description: `Mensalidade ${String(month).padStart(2, "0")}/${year}`,
      amountOriginal: settings.defaultMonthlyAmount,
      discountValue: settings.defaultDiscountValue,
      amountCurrent: settings.defaultMonthlyAmount - settings.defaultDiscountValue,
      dueDate,
      lateFeeType: settings.defaultLateFeeType,
      lateFeeValue: settings.defaultLateFeeValue,
      dailyInterestType: settings.defaultDailyInterestType,
      dailyInterestValue: settings.defaultDailyInterestValue,
      status: "pending",
      metadata: { month, year, generatedBy: "manual-batch" }
    });

    created.push(invoice);
  }

  return res.json({
    ok: true,
    createdCount: created.length,
    totalActiveAssociates: associates.length,
    created
  });
});

module.exports = router;
