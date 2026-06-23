const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true
    },
    mercadopagoEnabled: { type: Boolean, default: false },
    mercadopagoEnvironment: {
      type: String,
      enum: ["production", "sandbox"],
      default: "production"
    },
    mercadopagoAccessTokenEncrypted: { type: String, select: false },
    mercadopagoPublicKey: { type: String, trim: true, select: false },
    mercadopagoClientId: { type: String, trim: true },
    mercadopagoClientSecretEncrypted: { type: String, select: false },
    mercadopagoWebhookSecretEncrypted: { type: String, select: false },
    mercadopagoWebhookUrl: { type: String, trim: true },
    mercadopagoPixEnabled: { type: Boolean, default: true },
    mercadopagoBoletoEnabled: { type: Boolean, default: false },
    mercadopagoBoletoMethod: { type: String, default: "bolbradesco", trim: true },
    mercadopagoStatementDescriptor: { type: String, trim: true, maxlength: 22 },
    mercadopagoNotificationEmail: { type: String, trim: true, lowercase: true },
    mercadopagoLastTestAt: { type: Date },
    mercadopagoLastTestStatus: {
      type: String,
      enum: ["success", "error", "never"],
      default: "never"
    },
    mercadopagoLastTestMessage: { type: String, trim: true },
    mercadopagoAccountHolderName: { type: String, trim: true },
    mercadopagoAccountId: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TenantMercadoPagoSettings", schema);
