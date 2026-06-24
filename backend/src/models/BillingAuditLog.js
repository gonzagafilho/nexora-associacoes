const mongoose = require("mongoose");

const billingAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    userEmail: { type: String, trim: true, lowercase: true, index: true },
    userRole: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    action: {
      type: String,
      enum: ["saas_checkout", "saas_webhook", "saas_renewal", "saas_manual_pix", "associate_invoice_manual"],
      required: true,
      index: true
    },
    scope: {
      type: String,
      enum: ["saas", "associate"],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["success", "failed", "ignored", "reused"],
      required: true,
      index: true
    },
    message: { type: String, trim: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", index: true },
    associateId: { type: mongoose.Schema.Types.ObjectId, ref: "Associate", index: true },
    saasPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: "SaasSubscriptionPayment", index: true },
    gatewayPaymentId: { type: String, trim: true, index: true },
    amount: { type: Number },
    metadata: { type: Object, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

billingAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
billingAuditLogSchema.index({ scope: 1, action: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("BillingAuditLog", billingAuditLogSchema);
