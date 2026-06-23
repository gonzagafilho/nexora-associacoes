const bcrypt = require("bcryptjs");
const { connectDatabase } = require("../config/database");
const Tenant = require("../models/Tenant");
const TenantBranding = require("../models/TenantBranding");
const TenantBillingSettings = require("../models/TenantBillingSettings");
const User = require("../models/User");

async function seed() {
  await connectDatabase();

  const tenant = await Tenant.findOneAndUpdate(
    { name: "Associação Modelo" },
    {
      name: "Associação Modelo",
      legalDocument: "00000000000000",
      phone: "61999999999",
      email: "admin@associacao.local",
      address: "Endereço da associação",
      receiverName: "Associação Modelo",
      receiverDocument: "00000000000000",
      pixKey: "pix@associacao.local",
      paymentGateway: "manual",
      status: "active"
    },
    { upsert: true, new: true }
  );

  await TenantBranding.findOneAndUpdate(
    { tenantId: tenant._id },
    { tenantId: tenant._id, logoUrl: "", primaryColor: "#0ea5e9", secondaryColor: "#ffffff", documentFooter: "Documento gerado automaticamente." },
    { upsert: true, new: true }
  );

  await TenantBillingSettings.findOneAndUpdate(
    { tenantId: tenant._id },
    {
      tenantId: tenant._id,
      defaultMonthlyAmount: 50,
      defaultDueDay: 10,
      defaultLateFeeType: "fixed",
      defaultLateFeeValue: 2,
      defaultDailyInterestType: "percent",
      defaultDailyInterestValue: 0.033,
      defaultDiscountValue: 0,
      pixExpirationDays: 3,
      pdfMessage: "Use o QR Code Pix ou o Pix copia e cola para realizar o pagamento."
    },
    { upsert: true, new: true }
  );

  const passwordHash = await bcrypt.hash("admin123", 10);

  await User.findOneAndUpdate(
    { tenantId: tenant._id, email: "admin@associacao.local" },
    { tenantId: tenant._id, name: "Administrador", email: "admin@associacao.local", passwordHash, role: "owner", status: "active" },
    { upsert: true, new: true }
  );

  console.log("Seed concluído");
  console.log("Login: admin@associacao.local");
  console.log("Senha: admin123");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
