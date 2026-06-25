const mongoose = require("mongoose");

const workflowSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true, index: true },
    trigger: {
      type: { type: String, required: true, default: "event", index: true },
      eventName: { type: String, default: "", index: true },
      schedule: { type: Object, default: {} }
    },
    conditions: [{ type: Object }],
    actions: [{ type: Object }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }
  },
  { timestamps: true }
);

workflowSchema.index({ tenantId: 1, "trigger.eventName": 1, enabled: 1 });
workflowSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("Workflow", workflowSchema);
