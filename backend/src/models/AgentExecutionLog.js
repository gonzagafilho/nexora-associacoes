const mongoose = require("mongoose");

const agentExecutionLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    agentId: { type: String, required: true, trim: true, index: true },
    input: { type: String, trim: true, default: "" },
    output: { type: Object, default: {} },
    status: { type: String, enum: ["success", "failed"], required: true, index: true },
    latencyMs: { type: Number, default: 0 },
    error: { type: String, trim: true, default: "" },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

agentExecutionLogSchema.index({ tenantId: 1, createdAt: -1 });
agentExecutionLogSchema.index({ tenantId: 1, agentId: 1, createdAt: -1 });

module.exports = mongoose.model("AgentExecutionLog", agentExecutionLogSchema);
