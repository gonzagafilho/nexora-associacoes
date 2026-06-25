const express = require("express");

const auth = require("../../middlewares/auth");
const { buildExecutiveContext } = require("../../services/intelligence/executiveService");

const router = express.Router();

router.get("/executive", auth, async (req, res) => {
  try {
    const data = await buildExecutiveContext({ tenantId: req.user.tenantId, userId: req.user.id });
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("[bi:executive]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar BI executivo." });
  }
});

module.exports = router;
