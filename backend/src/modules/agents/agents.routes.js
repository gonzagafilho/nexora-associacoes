const express = require("express");

const auth = require("../../middlewares/auth");
const { registry, supervisor, initializeAgents } = require("../../agents");
const { listExecutionLogs } = require("../../agents/agentExecutionLogService");

const router = express.Router();

router.use(auth);

router.get("/", async (_req, res) => {
  return res.json({ ok: true, agents: registry.getAllAgents().map((agent) => agent.getStatus()) });
});

router.get("/status", async (_req, res) => {
  return res.json({
    ok: true,
    supervisor: { status: "online", version: "3.6.0" },
    agents: registry.getAgentStatus()
  });
});

router.get("/logs", async (req, res) => {
  try {
    const logs = await listExecutionLogs({
      tenantId: req.user.tenantId,
      agentId: req.query.agentId,
      status: req.query.status,
      limit: req.query.limit
    });
    return res.json({ ok: true, logs });
  } catch (error) {
    console.error("[agents:logs]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar logs dos agentes." });
  }
});

router.get("/:id", async (req, res) => {
  const agent = registry.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, message: "Agente não encontrado." });
  return res.json({ ok: true, agent: registry.getAgentStatus().find((item) => item.id === agent.id) });
});

router.post("/test", async (req, res) => {
  try {
    const question = String(req.body?.question || req.body?.message || "Como está minha empresa?").trim();
    const result = await supervisor.execute(question, { tenantId: req.user.tenantId, userId: req.user.id });
    return res.json(result);
  } catch (error) {
    console.error("[agents:test]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao testar supervisor." });
  }
});

router.post("/reload", async (_req, res) => {
  registry.registerDefaultAgents();
  initializeAgents();
  return res.json({ ok: true, agents: registry.getAllAgents().map((agent) => agent.getStatus()) });
});

router.post("/supervisor", async (req, res) => {
  try {
    const question = String(req.body?.question || req.body?.message || "").trim();
    if (!question) return res.status(400).json({ ok: false, message: "Pergunta não informada." });
    const result = await supervisor.execute(question, { tenantId: req.user.tenantId, userId: req.user.id });
    return res.json(result);
  } catch (error) {
    console.error("[agents:supervisor]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao executar supervisor." });
  }
});

module.exports = router;
