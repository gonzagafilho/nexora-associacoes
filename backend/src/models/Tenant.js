const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    legalDocument: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    receiverName: { type: String, trim: true },
    receiverDocument: { type: String, trim: true },
    pixKey: { type: String, trim: true },
    paymentGateway: {
      type: String,
      enum: ["manual", "mercadopago", "cora"],
      default: "manual"
    },
    businessType: {
      type: String,
      enum: ["association", "company", "condominium", "ngo", "construction"],
      default: "association"
    },
    enabledModules: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values)
        ? Array.from(new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)))
        : []
    },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active"
    }
  },
  { timestamps: true }
);

tenantSchema.index({ name: 1 });
tenantSchema.index({ legalDocument: 1 });

module.exports = mongoose.model("Tenant", tenantSchema);
