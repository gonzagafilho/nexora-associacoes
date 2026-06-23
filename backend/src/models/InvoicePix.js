const mongoose = require("mongoose");

const invoicePixSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    gateway: { type: String, enum: ["manual", "mercadopago", "cora"], default: "manual" },
    gatewayPaymentId: { type: String, trim: true },
    qrCodeText: { type: String, trim: true },
    qrCodeImageUrl: { type: String, trim: true },
    pixCopyPaste: { type: String, trim: true },
    amount: { type: Number, required: true },
    expiresAt: { type: Date },
    status: { type: String, enum: ["active", "paid", "expired", "cancelled"], default: "active" },
    paidAt: { type: Date },
    paidAmount: { type: Number },
    paymentGateway: { type: String, enum: ["manual", "mercadopago", "cora"] },
    paymentExternalId: { type: String, trim: true }
  },
  { timestamps: true }
);

invoicePixSchema.index({ tenantId: 1, invoiceId: 1 });
invoicePixSchema.index({ gateway: 1, gatewayPaymentId: 1 });

module.exports = mongoose.model("InvoicePix", invoicePixSchema);
