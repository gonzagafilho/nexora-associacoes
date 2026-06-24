const mongoose = require("mongoose");

const ASSET_CATEGORIES = [
  "veiculo",
  "maquina",
  "ferramenta",
  "computador",
  "notebook",
  "impressora",
  "camera",
  "radio",
  "roteador",
  "switch",
  "fibra",
  "imovel",
  "estoque",
  "outro"
];

const ASSET_STATUSES = [
  "active",
  "maintenance",
  "stored",
  "lost",
  "sold",
  "retired"
];

const assetSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
    assetCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ASSET_CATEGORIES, default: "outro", index: true },
    description: { type: String, trim: true, default: "" },
    serialNumber: { type: String, trim: true, default: "" },
    acquisitionDate: { type: Date },
    acquisitionValue: { type: Number, default: 0, min: 0 },
    currentValue: { type: Number, default: 0, min: 0 },
    supplier: { type: String, trim: true, default: "" },
    responsibleName: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    status: { type: String, enum: ASSET_STATUSES, default: "active", index: true },
    notes: { type: String, trim: true, default: "" },
    qrCode: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

assetSchema.index({ tenantId: 1, assetCode: 1 }, { unique: true });
assetSchema.index({ tenantId: 1, category: 1, status: 1 });
assetSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("Asset", assetSchema);
module.exports.ASSET_CATEGORIES = ASSET_CATEGORIES;
module.exports.ASSET_STATUSES = ASSET_STATUSES;
