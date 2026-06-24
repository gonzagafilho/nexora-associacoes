const mongoose = require("mongoose");

const PROJECT_TYPES = ["obra", "projeto", "evento", "campanha", "outro"];
const PROJECT_STATUSES = ["planning", "active", "paused", "completed", "cancelled"];
const PROJECT_BUDGET_CATEGORIES = ["mao_de_obra", "material", "servico", "equipamento", "deslocamento", "outro"];

const projectBudgetItemSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, default: "" },
    category: { type: String, enum: PROJECT_BUDGET_CATEGORIES, default: "outro" },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, trim: true, default: "unidade" },
    unitMaterialCost: { type: Number, default: 0, min: 0 },
    unitLaborCost: { type: Number, default: 0, min: 0 },
    totalMaterialCost: { type: Number, default: 0, min: 0 },
    totalLaborCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },
    profit: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    type: { type: String, enum: PROJECT_TYPES, default: "projeto", index: true },
    status: { type: String, enum: PROJECT_STATUSES, default: "planning", index: true },
    startDate: { type: Date },
    endDate: { type: Date },
    budget: { type: Number, default: 0, min: 0 },
    budgetItems: { type: [projectBudgetItemSchema], default: [] },
    materialTotal: { type: Number, default: 0, min: 0 },
    laborTotal: { type: Number, default: 0, min: 0 },
    costTotal: { type: Number, default: 0, min: 0 },
    saleTotal: { type: Number, default: 0, min: 0 },
    profitTotal: { type: Number, default: 0 },
    profitMarginPercent: { type: Number, default: 0 },
    spent: { type: Number, default: 0, min: 0 },
    responsibleName: { type: String, trim: true, default: "" },
    responsiblePhone: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

projectSchema.index({ tenantId: 1, status: 1 });
projectSchema.index({ tenantId: 1, type: 1 });
projectSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("Project", projectSchema);
module.exports.PROJECT_TYPES = PROJECT_TYPES;
module.exports.PROJECT_STATUSES = PROJECT_STATUSES;
module.exports.PROJECT_BUDGET_CATEGORIES = PROJECT_BUDGET_CATEGORIES;
