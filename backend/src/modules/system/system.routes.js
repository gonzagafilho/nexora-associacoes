const express = require("express");

const auth = require("../../middlewares/auth");
const { RESERVED_EVENTS } = require("../../os/eventBus");
const { listDrivers } = require("../../os/driverRegistry");
const { bootKernel, getKernelCapabilities, getKernelInfo, getRegisteredEngines } = require("../../os/kernel");
const { getOsHealth } = require("../../os/osHealthService");
const { buildSystemOs } = require("../../services/system/osService");

const router = express.Router();

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

module.exports = router;
