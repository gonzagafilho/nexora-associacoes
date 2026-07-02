const express = require("express");
const auth = require("../../middlewares/auth");
const {
  getApps,
  getStatus,
  getCore,
  getModules,
  getAppDashboard
} = require("./platform.controller");

const router = express.Router();

router.use(auth);

router.get("/apps", getApps);
router.get("/status", getStatus);
router.get("/core", getCore);
router.get("/modules", getModules);
router.get("/apps/:appId", getAppDashboard);

module.exports = router;
