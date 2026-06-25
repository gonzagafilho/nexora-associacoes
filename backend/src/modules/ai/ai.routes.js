const express = require("express");

const auth = require("../../middlewares/auth");
const { answerQuestion, HELP_QUESTIONS } = require("../../services/intelligence/aiAssistantService");
const { buildExecutiveContext } = require("../../services/intelligence/executiveService");

const router = express.Router();

router.get("/context", auth, async (req, res) => {
  try {
    const context = await buildExecutiveContext({ tenantId: req.user.tenantId, userId: req.user.id });
    return res.json({ ok: true, context, supportedQuestions: HELP_QUESTIONS });
  } catch (error) {
    console.error("[ai:context]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar contexto inteligente." });
  }
});

router.post("/chat", auth, async (req, res) => {
  try {
    const question = String(req.body?.question || req.body?.message || "").trim();
    const result = await answerQuestion({ tenantId: req.user.tenantId, userId: req.user.id, question });
    return res.json(result);
  } catch (error) {
    console.error("[ai:chat]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao consultar o NEXORA." });
  }
});

module.exports = router;
