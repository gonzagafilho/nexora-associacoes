const express = require("express");

const auth = require("../../middlewares/auth");
const controller = require("./aiActivityLog.controller");

const router = express.Router();

router.use(auth);

router.get("/", controller.list);
router.get("/stats", controller.stats);
router.get("/:id", controller.getById);

module.exports = router;
