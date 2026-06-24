const mongoose = require("mongoose");

const saasModuleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, lowercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    monthlyPrice: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

saasModuleSchema.index({ code: 1 }, { unique: true });
saasModuleSchema.index({ active: 1, code: 1 });

module.exports = mongoose.model("SaasModule", saasModuleSchema);
