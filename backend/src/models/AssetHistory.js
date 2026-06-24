const mongoose = require("mongoose");

const ASSET_HISTORY_ACTIONS = [
  "criacao",
  "edicao",
  "manutencao",
  "transferencia",
  "venda",
  "baixa",
  "exclusao"
];

const assetHistorySchema = new mongoose.Schema(
  {
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    action: { type: String, enum: ASSET_HISTORY_ACTIONS, required: true, index: true },
    user: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      email: { type: String, trim: true, lowercase: true, default: "" },
      role: { type: String, trim: true, default: "" }
    },
    date: { type: Date, default: Date.now, index: true },
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

assetHistorySchema.index({ tenantId: 1, assetId: 1, date: -1 });
assetHistorySchema.index({ tenantId: 1, action: 1, date: -1 });

module.exports = mongoose.model("AssetHistory", assetHistorySchema);
module.exports.ASSET_HISTORY_ACTIONS = ASSET_HISTORY_ACTIONS;
