const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TenantSubscription",
      required: true,
      index: true
    },

    plan: {
      type: String,
      enum: ["professional"],
      default: "professional",
      index: true
    },

    gateway: {
      type: String,
      enum: ["mercadopago"],
      default: "mercadopago",
      index: true
    },

    method: {
      type: String,
      enum: ["pix"],
      default: "pix",
      index: true
    },

    source: {
      type: String,
      enum: ["checkout", "renewal", "manual"],
      default: "checkout",
      index: true
    },

    externalId: String,
    gatewayPaymentId: String,
    externalReference: String,

    status: {
      type: String,
      default: "pending",
      index: true
    },

    amount: Number,
    qrCode: String,
    copyPaste: String,
    qrCodeBase64: String,
    ticketUrl: String,
    expiresAt: Date,
    paidAt: Date,

    rawCreateResponse: Object,
    rawResponse: Object,
    rawWebhookPayload: Object,
    rawPayment: Object,
    rawLastStatusResponse: Object,

    lastCheckedAt: Date,
    webhookReceivedAt: Date,
    errorMessage: String
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, subscriptionId: 1, status: 1, createdAt: -1 });
schema.index({ gateway: 1, externalId: 1 }, { unique: true, sparse: true });
schema.index({ externalReference: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("SaasSubscriptionPayment", schema);
