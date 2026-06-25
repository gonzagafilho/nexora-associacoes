const express = require("express");

const auth = require("../../middlewares/auth");
const { RESERVED_EVENTS } = require("../../os/eventBus");
const { listDrivers } = require("../../os/driverRegistry");
const { bootKernel, getKernelCapabilities, getKernelInfo, getRegisteredEngines } = require("../../os/kernel");
const { getOsHealth } = require("../../os/osHealthService");
const runtime = require("../../runtime/runtime");
const { getRuntimeHealth } = require("../../runtime/runtimeHealthService");
const { getRuntimeInspector } = require("../../runtime/runtimeInspectorService");
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

router.get("/runtime", auth, async (req, res) => {
  try {
    runtime.bootRuntime();
    const context = runtime.context().createTenantContext({
      tenantId: scopedTenantId(req),
      userId: req.user?.id,
      role: req.user?.role,
      modules: req.tenantModules || req.user?.enabledModules || []
    });
    const cacheStats = runtime.cache().stats();
    const sessionStats = runtime.sessions().stats();
    const workflow = await runtime.workflowDashboard(context).catch(() => ({ totalWorkflows: 0 }));
    return res.json({
      ok: true,
      runtime: runtime.getRuntimeInfo(),
      status: runtime.getRuntimeStatus(),
      capabilities: runtime.getRuntimeCapabilities(),
      metrics: runtime.getRuntimeMetrics({
        cacheEntries: cacheStats.total,
        activeSessions: sessionStats.active,
        workflowsActive: Number(workflow.totalWorkflows || 0)
      })
    });
  } catch (error) {
    console.error("[system:runtime]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar NEXORA Runtime." });
  }
});

router.get("/runtime/health", auth, async (req, res) => {
  try {
    runtime.bootRuntime();
    const context = runtime.context().createTenantContext({
      tenantId: scopedTenantId(req),
      userId: req.user?.id,
      role: req.user?.role,
      modules: req.tenantModules || req.user?.enabledModules || []
    });
    const health = await getRuntimeHealth(context);
    return res.json({ ok: true, ...health });
  } catch (error) {
    console.error("[system:runtime:health]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar saúde do NEXORA Runtime." });
  }
});

router.get("/runtime/inspector", auth, async (req, res) => {
  try {
    runtime.bootRuntime();
    const context = runtime.context().createTenantContext({
      tenantId: scopedTenantId(req),
      userId: req.user?.id,
      role: req.user?.role,
      modules: req.tenantModules || req.user?.enabledModules || []
    });
    const inspector = await getRuntimeInspector(context);
    return res.json({ ok: true, ...inspector });
  } catch (error) {
    console.error("[system:runtime:inspector]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar inspector do NEXORA Runtime." });
  }
});

router.get("/runtime/services", auth, async (req, res) => {
  try {
    runtime.bootRuntime();
    return res.json({ ok: true, items: runtime.listServices() });
  } catch (error) {
    console.error("[system:runtime:services]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar serviços do NEXORA Runtime." });
  }
});

router.get("/runtime/sessions", auth, async (req, res) => {
  try {
    runtime.bootRuntime();
    const items = runtime.sessions().listSessions({
      tenantId: scopedTenantId(req),
      type: req.query.type,
      status: req.query.status
    });
    return res.json({ ok: true, items, stats: runtime.sessions().stats() });
  } catch (error) {
    console.error("[system:runtime:sessions]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar sessões do NEXORA Runtime." });
  }
});

router.get("/runtime/cache", auth, async (_req, res) => {
  try {
    runtime.bootRuntime();
    return res.json({ ok: true, stats: runtime.cache().stats() });
  } catch (error) {
    console.error("[system:runtime:cache]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar cache do NEXORA Runtime." });
  }
});

module.exports = router;
