const mongoose = require("mongoose");

const tenantBrandingSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    logoUrl: { type: String, trim: true },
    logoOriginalPath: { type: String, trim: true },
    logoProcessedPath: { type: String, trim: true },
    logoFilename: { type: String, trim: true },
    uploadedAt: { type: Date },
    backgroundRemoved: { type: Boolean, default: false },
    logoUseProcessed: { type: Boolean, default: false },
    primaryColor: { type: String, default: "#0ea5e9" },
    secondaryColor: { type: String, default: "#ffffff" },
    documentFooter: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TenantBranding", tenantBrandingSchema);
