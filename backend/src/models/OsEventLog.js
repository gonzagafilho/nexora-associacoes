const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    eventName: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    entityId: { type: String, default: "", index: true },
    entityType: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, enum: ["success", "partial", "failed"], default: "success", index: true },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    occurredAt: { type: Date, required: true, index: true },
    payload: { type: Object, default: {} },
    errors: [{ type: String }]
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    suppressReservedKeysWarning: true
  }
);

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, module: 1, createdAt: -1 });
schema.index({ tenantId: 1, eventName: 1, createdAt: -1 });

module.exports = mongoose.model("OsEventLog", schema);
