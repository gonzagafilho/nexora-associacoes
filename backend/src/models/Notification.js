const mongoose = require("mongoose");

const NOTIFICATION_TYPES = ["info", "warning", "success", "error"];
const NOTIFICATION_SEVERITIES = ["low", "medium", "high", "critical"];
const NOTIFICATION_MODULES = ["saas", "associates", "invoices", "financial", "projects", "assets", "protocols"];

const notificationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: "info", index: true },
    severity: { type: String, enum: NOTIFICATION_SEVERITIES, default: "low", index: true },
    module: { type: String, enum: NOTIFICATION_MODULES, required: true, index: true },
    referenceId: { type: String, trim: true, default: "", index: true },
    referenceType: { type: String, trim: true, default: "" },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, trim: true, default: "", index: true },
    delivery: {
      email: { type: String, enum: ["pending", "disabled", "sent"], default: "disabled" },
      whatsapp: { type: String, enum: ["pending", "disabled", "sent"], default: "disabled" },
      push: { type: String, enum: ["pending", "disabled", "sent"], default: "disabled" },
      mobile: { type: String, enum: ["pending", "disabled", "sent"], default: "disabled" }
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_SEVERITIES = NOTIFICATION_SEVERITIES;
module.exports.NOTIFICATION_MODULES = NOTIFICATION_MODULES;