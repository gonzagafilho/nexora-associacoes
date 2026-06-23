const express = require("express");
const auth = require("../../middlewares/auth");
const Invoice = require("../../models/Invoice");
const Associate = require("../../models/Associate");
const {
  buildInvoicePayload,
  refreshInvoiceAmount
} = require("../../services/invoiceService");
const {
  createBoletoForInvoice
} = require("../../services/boleto/mercadoPagoBoletoService");

const router = express.Router();

router.post("/", auth, async (req, res) => {
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

router.post("/:id/boleto/mercadopago", auth, async (req, res) => {
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

router.get("/", auth, async (req, res) => {
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

router.get("/:id", auth, async (req, res) => {
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

router.put("/:id", auth, async (req, res) => {
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

router.delete("/:id", auth, async (req, res) => {
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

router.post("/:id/mark-paid", auth, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId
  });

  if (!invoice) {
    return res.status(404).json({ ok: false, message: "Cobrança não encontrada." });
  }

  invoice.status = "paid";
  invoice.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();

  await invoice.save();

  return res.json({ ok: true, invoice });
});

router.post("/generate-monthly", auth, async (req, res) => {
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
