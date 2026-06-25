const mongoose = require("mongoose");

const workflowExecutionSchema = new mongoose.Schema(
  {
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    status: { type: String, enum: ["running", "completed", "failed", "stopped"], default: "running", index: true },
    event: { type: Object, default: {} },
    logs: [{ type: Object }],
    error: { type: String, default: "" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

workflowExecutionSchema.index({ tenantId: 1, createdAt: -1 });
workflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });

module.exports = mongoose.model("WorkflowExecution", workflowExecutionSchema);
