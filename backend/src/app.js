const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./modules/auth/auth.routes");
const meRoutes = require("./modules/me/me.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const associatesRoutes = require("./modules/associates/associates.routes");
const invoicesRoutes = require("./modules/invoices/invoices.routes");
const invoicePdfRoutes = require("./modules/invoices/invoice-pdf.routes");
const pixRoutes = require("./modules/pix/pix.routes");
const publicRoutes = require("./modules/public/public.routes");
const subscriptionRoutes = require("./modules/subscription/subscription.routes");
const tenantRoutes = require("./modules/tenant/tenant.routes");
const financialRoutes = require("./modules/financial/financial.routes");
const projectRoutes = require("./modules/projects/projects.routes");
const assetRoutes = require("./modules/assets/assets.routes");
const protocolRoutes = require("./modules/protocols/protocols.routes");
const notificationRoutes = require("./modules/notifications/notifications.routes");
const pushRoutes = require("./modules/push/push.routes");
const aiRoutes = require("./modules/ai/assistant.routes");
const biRoutes = require("./modules/bi/bi.routes");
const systemRoutes = require("./modules/system/system.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"))
app.use("/storage/branding", express.static(path.resolve(process.cwd(), "../storage/branding")));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "associacao-bolepix-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/associates", associatesRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/invoices", invoicePdfRoutes);
app.use("/api/pix", pixRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/financial", financialRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/protocols", protocolRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/bi", biRoutes);
app.use("/api/system", systemRoutes);
app.post(
  "/api/bolepix/webhooks/mercadopago",
  pixRoutes.mercadoPagoWebhook
);

module.exports = app;
