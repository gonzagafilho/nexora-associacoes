const express = require("express");
const auth = require("../../../middlewares/auth");
const {
  getStatus,
  createPlan,
  executePlan,
  listPlans,
  getPlan
} = require("./orchestrator.controller");

const router = express.Router();

router.use(auth);

router.get("/status", getStatus);
router.post("/plan", createPlan);
router.post("/execute", executePlan);
router.get("/plans", listPlans);
router.get("/plans/:id", getPlan);

module.exports = router;
