const express = require("express");

const auth = require("../../middlewares/auth");
const { RESERVED_EVENTS } = require("../../os/eventBus");
const { listDrivers } = require("../../os/driverRegistry");
const { bootKernel, getKernelCapabilities, getKernelInfo, getRegisteredEngines } = require("../../os/kernel");
const { getOsHealth } = require("../../os/osHealthService");
const { getOsEventsDashboard, listOsEvents } = require("../../services/system/osEventLogService");
const { buildSystemOs } = require("../../services/system/osService");

const router = express.Router();

function canUseGlobalTenantFilter(role = "") {
  return new Set(["owner", "admin", "superadmin"]).has(String(role || "").toLowerCase());
}

function scopedTenantId(req) {
  if (req.query.tenantId && canUseGlobalTenantFilter(req.user?.role)) {
    return String(req.query.tenantId);
  }
  return req.user.tenantId;
}

router.get("/os", auth, async (req, res) => {
  try {
    const os = await buildSystemOs({ tenantId: req.user.tenantId });
    return res.json({ ok: true, ...os });
  } catch (error) {
    console.error("[system:os]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar NEXORA OS." });
  }
});

router.get("/kernel", auth, async (req, res) => {
  try {
    bootKernel();
    return res.json({
      ok: true,
      kernel: getKernelInfo(),
      engines: getRegisteredEngines(),
      capabilities: getKernelCapabilities(),
      health: getOsHealth(),
      drivers: listDrivers(),
      reservedEvents: RESERVED_EVENTS
    });
  } catch (error) {
    console.error("[system:kernel]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar diagnóstico do NEXORA OS Kernel." });
  }
});

router.get("/events", auth, async (req, res) => {
  try {
    const result = await listOsEvents({
      tenantId: scopedTenantId(req),
      eventName: req.query.eventName,
      module: req.query.module,
      action: req.query.action,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[system:events]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar eventos do NEXORA OS." });
  }
});

router.get("/events/dashboard", auth, async (req, res) => {
  try {
    const dashboard = await getOsEventsDashboard({
      tenantId: scopedTenantId(req),
      eventName: req.query.eventName,
      module: req.query.module,
      action: req.query.action,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    return res.json({ ok: true, ...dashboard });
  } catch (error) {
    console.error("[system:events:dashboard]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar dashboard de eventos do NEXORA OS." });
  }
});

module.exports = router;
