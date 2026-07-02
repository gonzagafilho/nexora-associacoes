const express = require("express");

const auth = require("../../middlewares/auth");
const aiActivityLogRoutes = require("./aiActivityLog.routes");
const skillsRoutes = require("./skills.routes");
const {
	askAssistant,
	getContext,
	getHistory,
	legacyChat,
	getLegacyContext
} = require("./assistant.controller");

const router = express.Router();

router.use("/activity-logs", aiActivityLogRoutes);
router.use("/skills", skillsRoutes);

router.get("/assistant/context", auth, getContext);
router.get("/assistant/history", auth, getHistory);
router.post("/assistant/message", auth, askAssistant);

// Compatibilidade com frontend legado em /api/ai
router.get("/context", auth, getLegacyContext);
router.post("/chat", auth, legacyChat);

module.exports = router;
