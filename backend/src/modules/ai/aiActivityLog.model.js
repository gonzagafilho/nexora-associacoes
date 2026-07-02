const mongoose = require("mongoose");

const activityStatus = ["success", "error"];

const aiActivityLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    projectKey: { type: String, trim: true, default: "associacoes", index: true },
    module: { type: String, trim: true, default: "NEXORA IA" },
    action: { type: String, trim: true, default: "assistant.message", index: true },
    question: { type: String, trim: true, default: "" },
    answer: { type: String, trim: true, default: "" },
    memoryIds: { type: [String], default: [] },
    memoryCount: { type: Number, default: 0 },
    memoryContextPreview: { type: String, trim: true, default: "" },
    status: { type: String, enum: activityStatus, required: true, default: "success", index: true },
    errorMessage: { type: String, trim: true, default: "" },
    durationMs: { type: Number, default: 0 },
    metadata: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

aiActivityLogSchema.index({ tenantId: 1, createdAt: -1 });
aiActivityLogSchema.index({ tenantId: 1, projectKey: 1, createdAt: -1 });
aiActivityLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
aiActivityLogSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AiActivityLog", aiActivityLogSchema);
