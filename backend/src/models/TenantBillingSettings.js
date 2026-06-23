const mongoose = require("mongoose");

const tenantBillingSettingsSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    defaultMonthlyAmount: { type: Number, default: 0 },
    defaultDueDay: { type: Number, default: 10 },
    defaultLateFeeType: { type: String, enum: ["fixed", "percent"], default: "fixed" },
    defaultLateFeeValue: { type: Number, default: 0 },
    defaultDailyInterestType: { type: String, enum: ["fixed", "percent"], default: "percent" },
    defaultDailyInterestValue: { type: Number, default: 0 },
    defaultDiscountValue: { type: Number, default: 0 },
    pixExpirationDays: { type: Number, default: 3 },
    boletoEnabled: { type: Boolean, default: false },
    boletoFeeAmount: { type: Number, default: 0, min: 0 },
    boletoFeeMode: { type: String, enum: ["fixed", "percent"], default: "fixed" },
    boletoInstructions: { type: String, default: "" },
    boletoDueDays: { type: Number, default: 3, min: 1, max: 30 },
    pdfMessage: {
      type: String,
      default: "Use o QR Code Pix ou o Pix copia e cola para realizar o pagamento."
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TenantBillingSettings", tenantBillingSettingsSchema);
