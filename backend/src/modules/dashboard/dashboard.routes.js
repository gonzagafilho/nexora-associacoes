const express = require("express");
const mongoose = require("mongoose");
const auth = require("../../middlewares/auth");

const Associate = require("../../models/Associate");
const Invoice = require("../../models/Invoice");
const Payment = require("../../models/Payment");
const PaymentGatewayTransaction = require("../../models/PaymentGatewayTransaction");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  const tenantId = req.user.tenantId;
  const tenantObjectId = mongoose.Types.ObjectId.createFromHexString(String(tenantId));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const chartStart = new Date(monthStart);
  chartStart.setMonth(chartStart.getMonth() - 5);

  const [
    associates,
    activeAssociates,
    pendingInvoices,
    paidInvoices,
    overdueInvoices,
    pixGenerated,
    boletosGenerated,
    pendingAgg,
    paidAgg,
    overdueAgg,
    monthlyPayments,
    monthlyInvoices
  ] = await Promise.all([
    Associate.countDocuments({ tenantId }),
    Associate.countDocuments({ tenantId, status: "active" }),
    Invoice.countDocuments({ tenantId, status: "pending" }),
    Invoice.countDocuments({ tenantId, status: "paid" }),
    Invoice.countDocuments({ tenantId, status: "overdue" }),
    PaymentGatewayTransaction.countDocuments({ tenantId, method: "pix" }),
    PaymentGatewayTransaction.countDocuments({ tenantId, method: "boleto" }),
    Invoice.aggregate([
      { $match: { tenantId: tenantObjectId, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amountCurrent" } } }
    ]),
    Payment.aggregate([
      { $match: { tenantId: tenantObjectId } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } }
    ]),
    Invoice.aggregate([
      { $match: { tenantId: tenantObjectId, status: "overdue" } },
      { $group: { _id: null, total: { $sum: "$amountCurrent" } } }
    ]),
    Payment.aggregate([
      { $match: { tenantId: tenantObjectId, paidAt: { $gte: chartStart } } },
      {
        $group: {
          _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
          total: { $sum: "$amountPaid" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]),
    Invoice.aggregate([
      { $match: { tenantId: tenantObjectId, createdAt: { $gte: chartStart } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          total: { $sum: "$amountCurrent" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ])
  ]);

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() - offset);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const payments = monthlyPayments.find((item) => item._id.year === year && item._id.month === month);
    const invoices = monthlyInvoices.find((item) => item._id.year === year && item._id.month === month);
    months.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
      received: payments?.total || 0,
      payments: payments?.count || 0,
      charged: invoices?.total || 0,
      invoices: invoices?.count || 0
    });
  }

  return res.json({
    ok: true,
    data: {
      associates,
      activeAssociates,
      inactiveAssociates: Math.max(0, associates - activeAssociates),
      pendingInvoices,
      paidInvoices,
      overdueInvoices,
      totalReceber: pendingAgg[0]?.total || 0,
      totalRecebido: paidAgg[0]?.total || 0,
      totalVencido: overdueAgg[0]?.total || 0,
      pixGenerated,
      boletosGenerated,
      months
    }
  });
});

module.exports = router;
