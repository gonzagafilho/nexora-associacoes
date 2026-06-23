const express = require("express");
const auth = require("../../middlewares/auth");

const PaymentGatewayTransaction = require("../../models/PaymentGatewayTransaction");
const Payment = require("../../models/Payment");
const mercadoPagoPixService = require("../../services/pix/mercadoPagoPixService");

const router = express.Router();

router.post("/invoices/:invoiceId/mercadopago", auth, async (req, res) => {
  try {
    const result = await mercadoPagoPixService.createPixForInvoice(
      req.params.invoiceId,
      req.user.tenantId
    );

    return res.json({
      ok: true,
      gateway: "mercadopago",
      ...result
    });
  } catch (error) {
    console.error("[pix:create]", error);
    return res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

router.get("/transactions", auth, async (req, res) => {
  const query = { tenantId: req.user.tenantId };
  if (req.query.method) query.method = req.query.method;
  if (req.query.status) query.status = req.query.status;

  const transactions = await PaymentGatewayTransaction.find(query)
    .populate("invoiceId", "description dueDate status amountCurrent")
    .populate("associateId", "name cpf")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const paymentIds = transactions.map((item) => item.externalId).filter(Boolean);
  const payments = await Payment.find({
    tenantId: req.user.tenantId,
    gatewayPaymentId: { $in: paymentIds }
  }).lean();
  const paymentsByExternalId = new Map(
    payments.map((payment) => [payment.gatewayPaymentId, payment])
  );

  return res.json({
    ok: true,
    transactions: transactions.map((transaction) => ({
      ...transaction,
      payment: paymentsByExternalId.get(transaction.externalId) || null
    }))
  });
});

router.get("/invoices/:invoiceId/transaction", auth, async (req, res) => {
  const transaction = await PaymentGatewayTransaction.findOne({
    tenantId: req.user.tenantId,
    invoiceId: req.params.invoiceId,
    gateway: req.query.gateway || "mercadopago"
  }).sort({ createdAt: -1 });

  return res.json({
    ok: true,
    transaction
  });
});

async function mercadoPagoWebhook(req, res) {
  try {
    const result = await mercadoPagoPixService.handleWebhook(req.body || {});

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("[pix:webhook:mercadopago]", error);

    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
}

router.post("/webhooks/mercadopago", mercadoPagoWebhook);

module.exports = router;
module.exports.mercadoPagoWebhook = mercadoPagoWebhook;
