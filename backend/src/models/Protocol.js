const mongoose = require("mongoose");

const PROTOCOL_TYPES = [
  "solicitacao",
  "reclamacao",
  "manutencao",
  "documento",
  "financeiro",
  "compra",
  "patrimonio",
  "projeto",
  "outro"
];

const PROTOCOL_PRIORITIES = ["low", "medium", "high", "urgent"];
const PROTOCOL_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"];

const protocolSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    protocolNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    type: { type: String, enum: PROTOCOL_TYPES, default: "solicitacao", index: true },
    priority: { type: String, enum: PROTOCOL_PRIORITIES, default: "medium", index: true },
    status: { type: String, enum: PROTOCOL_STATUSES, default: "open", index: true },
    requesterName: { type: String, trim: true, default: "" },
    requesterContact: { type: String, trim: true, default: "" },
    assignedToName: { type: String, trim: true, default: "" },
    dueDate: { type: Date },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    relatedProjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
    relatedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", index: true },
    relatedAssociateId: { type: mongoose.Schema.Types.ObjectId, ref: "Associate", index: true },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

protocolSchema.index({ tenantId: 1, protocolNumber: 1 }, { unique: true });
protocolSchema.index({ tenantId: 1, status: 1, priority: 1 });
protocolSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
protocolSchema.index({ tenantId: 1, dueDate: 1 });

module.exports = mongoose.model("Protocol", protocolSchema);
module.exports.PROTOCOL_TYPES = PROTOCOL_TYPES;
module.exports.PROTOCOL_PRIORITIES = PROTOCOL_PRIORITIES;
module.exports.PROTOCOL_STATUSES = PROTOCOL_STATUSES;