const mongoose = require("mongoose");

const tenantBrandingSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    logoUrl: { type: String, trim: true },
    primaryColor: { type: String, default: "#0ea5e9" },
    secondaryColor: { type: String, default: "#ffffff" },
    documentFooter: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TenantBranding", tenantBrandingSchema);
