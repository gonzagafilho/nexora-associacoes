const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    associateId: { type: mongoose.Schema.Types.ObjectId, ref: "Associate", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Associate" },
    competence: { type: String, trim: true },
    type: {
      type: String,
      enum: ["monthly", "extra", "agreement", "event", "manual", "maintenance", "club_entry", "uniform"],
      default: "monthly"
    },
    description: { type: String, required: true, trim: true },
    amountOriginal: { type: Number, required: true },
    discountValue: { type: Number, default: 0 },
    amountCurrent: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    lateFeeType: { type: String, enum: ["fixed", "percent"], default: "fixed" },
    lateFeeValue: { type: Number, default: 0 },
    dailyInterestType: { type: String, enum: ["fixed", "percent"], default: "percent" },
    dailyInterestValue: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "paid", "overdue", "cancelled"], default: "pending" },
    pixPaymentId: { type: String, trim: true },
    boletoPaymentId: { type: String, trim: true },
    pdfUrl: { type: String, trim: true },
    paidAt: { type: Date },
    paidAmount: { type: Number },
    paymentGateway: { type: String, enum: ["manual", "mercadopago", "cora"] },
    paymentMethod: { type: String, enum: ["manual", "pix", "boleto"] },
    paymentExternalId: { type: String, trim: true },
    cancelledAt: { type: Date },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

invoiceSchema.index({ tenantId: 1, associateId: 1 });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, dueDate: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
