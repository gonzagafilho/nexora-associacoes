const express = require("express");

const auth = require("../../middlewares/auth");
const { listSkills, getSkill, executeSkill } = require("./skills.controller");

const router = express.Router();

router.use(auth);

router.get("/", listSkills);
router.get("/:name", getSkill);
router.post("/execute", executeSkill);

module.exports = router;
