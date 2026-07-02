const express = require("express");

const auth = require("../../middlewares/auth");
const controller = require("./memory.controller");

const router = express.Router();

router.use(auth);

router.post("/", controller.create);
router.get("/", controller.list);
router.get("/search", controller.search);
router.get("/:id", controller.getById);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
