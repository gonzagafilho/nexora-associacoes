const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

pushSubscriptionSchema.index({ tenantId: 1, userId: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
