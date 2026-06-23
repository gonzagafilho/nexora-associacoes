const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    changedFields: [{ type: String }],
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", schema);
