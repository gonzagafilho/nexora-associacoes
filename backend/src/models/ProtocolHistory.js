const mongoose = require("mongoose");

const PROTOCOL_HISTORY_ACTIONS = [
  "criacao",
  "edicao",
  "mudanca_status",
  "resolucao",
  "fechamento",
  "cancelamento"
];

const protocolHistorySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    protocolId: { type: mongoose.Schema.Types.ObjectId, ref: "Protocol", required: true, index: true },
    action: { type: String, enum: PROTOCOL_HISTORY_ACTIONS, required: true, index: true },
    oldStatus: { type: String, trim: true, default: "" },
    newStatus: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userEmail: { type: String, trim: true, default: "" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

protocolHistorySchema.index({ tenantId: 1, protocolId: 1, createdAt: -1 });

module.exports = mongoose.model("ProtocolHistory", protocolHistorySchema);
module.exports.PROTOCOL_HISTORY_ACTIONS = PROTOCOL_HISTORY_ACTIONS;