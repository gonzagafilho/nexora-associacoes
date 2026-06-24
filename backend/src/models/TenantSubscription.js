const mongoose = require("mongoose");

const tenantSubscriptionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true
    },

    plan: {
      type: String,
      enum: ["trial", "professional", "enterprise"],
      default: "trial"
    },

    status: {
      type: String,
      enum: ["trialing", "active", "overdue", "blocked"],
      default: "trialing"
    },

    amount: {
      type: Number,
      default: 0
    },

    baseAmount: {
      type: Number,
      default: 0
    },

    additionalAmount: {
      type: Number,
      default: 0
    },

    enabledModules: {
      type: [String],
      default: []
    },

    trialDays: {
      type: Number,
      default: 7,
      min: 1,
      max: 365
    },

    trialEndsAt: Date,

    currentPeriodStart: Date,

    currentPeriodEnd: Date,

    nextBillingDate: Date,

    lastPaymentAt: Date
  },
  {
    timestamps: true
  }
);

tenantSubscriptionSchema.index({ tenantId: 1 });
tenantSubscriptionSchema.index({ status: 1 });
tenantSubscriptionSchema.index({ nextBillingDate: 1 });

module.exports = mongoose.model(
  "TenantSubscription",
  tenantSubscriptionSchema
);
