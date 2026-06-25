const mongoose = require("mongoose");

const workflowLogSchema = new mongoose.Schema(
  {
    executionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkflowExecution", required: true, index: true },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    action: { type: String, required: true },
    success: { type: Boolean, default: true, index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    payload: { type: Object, default: {} },
    error: { type: String, default: "" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

workflowLogSchema.index({ executionId: 1, createdAt: 1 });
workflowLogSchema.index({ workflowId: 1, createdAt: -1 });

module.exports = mongoose.model("WorkflowLog", workflowLogSchema);
