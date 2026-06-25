const mongoose = require("mongoose");

const aiMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["system", "user", "assistant", "tool"], required: true },
    text: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    meta: { type: Object, default: {} }
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    messages: { type: [aiMessageSchema], default: [] },
    intent: { type: String, default: "unknown", index: true },
    module: { type: String, default: "NEXORA IA", index: true },
    execution: {
      action: { type: String, default: "" },
      requiredConfirmation: { type: Boolean, default: false },
      confirmed: { type: Boolean, default: false },
      plan: { type: Object, default: null },
      payload: { type: Object, default: null },
      result: { type: Object, default: null }
    },
    status: {
      type: String,
      enum: ["open", "awaiting_data", "awaiting_confirmation", "executed", "cancelled", "error"],
      default: "open",
      index: true
    },
    responseTime: { type: Number, default: 0 }
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, userId: 1, conversationId: 1 }, { unique: true });
schema.index({ tenantId: 1, updatedAt: -1 });

module.exports = mongoose.model("AiConversation", schema);
