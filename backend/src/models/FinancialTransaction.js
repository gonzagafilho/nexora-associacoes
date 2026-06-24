const mongoose = require("mongoose");

const financialTransactionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: { type: String, enum: ["income", "expense"], required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date },
    status: { type: String, enum: ["pending", "paid", "cancelled", "overdue"], default: "pending", index: true },
    paymentMethod: { type: String, enum: ["pix", "cash", "bank_transfer", "card", "boleto", "other"], default: "other" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
    referenceType: { type: String, enum: ["invoice", "manual", "supplier", "adjustment"], default: "manual", index: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    supplierName: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

financialTransactionSchema.index({ tenantId: 1, type: 1, status: 1 });
financialTransactionSchema.index({ tenantId: 1, dueDate: 1 });
financialTransactionSchema.index({ tenantId: 1, createdAt: -1 });
financialTransactionSchema.index({ tenantId: 1, referenceType: 1, referenceId: 1 });
financialTransactionSchema.index({ tenantId: 1, projectId: 1, status: 1, type: 1 });

module.exports = mongoose.model("FinancialTransaction", financialTransactionSchema);
