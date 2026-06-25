const express = require("express");

const auth = require("../../middlewares/auth");
const {
	askAssistant,
	getContext,
	getHistory,
	legacyChat,
	getLegacyContext
} = require("./assistant.controller");

const router = express.Router();

router.get("/assistant/context", auth, getContext);
router.get("/assistant/history", auth, getHistory);
router.post("/assistant/message", auth, askAssistant);

// Compatibilidade com frontend legado em /api/ai
router.get("/context", auth, getLegacyContext);
router.post("/chat", auth, legacyChat);

module.exports = router;
