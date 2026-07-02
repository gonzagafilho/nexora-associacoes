const { registry } = require("./skills/registry");
const aiActivityLogService = require("./aiActivityLog.service");

function contextFromRequest(req) {
  return {
    tenantId: req.user.tenantId,
    userId: req.user.id,
    userRole: req.user.role,
    userEmail: req.user.email,
    enabledModules: req.user.enabledModules
  };
}

async function logSkillActivitySafe(req, data = {}) {
  try {
    await aiActivityLogService.createActivityLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      projectKey: data.projectKey || "associacoes",
      module: "NEXORA Skills",
      action: data.action || "skills.execute",
      question: data.question || "",
      answer: data.answer || "",
      memoryIds: [],
      memoryCount: 0,
      memoryContextPreview: "",
      status: data.status || "success",
      errorMessage: data.errorMessage || "",
      durationMs: Number(data.durationMs || 0),
      metadata: data.metadata || {}
    });
  } catch (_error) {
    // never break API response due to activity-log persistence
  }
}

async function listSkills(req, res) {
  try {
    const context = contextFromRequest(req);
    const skills = registry.list().map((skill) => ({
      ...skill,
      active: Boolean(skill.active) && registry.validatePermissions({ permissions: skill.permissions }, context)
    }));
    return res.json({ ok: true, skills });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao listar skills." });
  }
}

async function getSkill(req, res) {
  try {
    const raw = String(req.params.name || "").trim();
    const skillName = raw.split(".")[0];
    const skill = registry.findByName(skillName);
    if (!skill) return res.status(404).json({ ok: false, message: "Skill não encontrada." });

    const context = contextFromRequest(req);
    if (!registry.validatePermissions(skill, context)) {
      return res.status(403).json({ ok: false, message: "Permissão insuficiente para visualizar esta skill." });
    }

    return res.json({ ok: true, skill: skill.descriptor() });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao buscar skill." });
  }
}

async function executeSkill(req, res) {
  const startedAt = Date.now();
  const skillName = String(req.body?.name || req.body?.skill || "").trim();
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
  const projectKey = String(req.body?.projectKey || payload.projectKey || "associacoes").trim().toLowerCase() || "associacoes";

  try {
    if (!skillName) return res.status(400).json({ ok: false, message: "Nome da skill não informado." });

    const result = await registry.execute(skillName, payload, contextFromRequest(req));
    await logSkillActivitySafe(req, {
      projectKey,
      action: skillName,
      question: String(req.body?.question || skillName),
      answer: JSON.stringify(result.data || {}).slice(0, 6000),
      status: "success",
      durationMs: Date.now() - startedAt,
      metadata: {
        skillExecuted: skillName,
        skillDuration: result.durationMs,
        skillStatus: "success",
        source: "skills.execute"
      }
    });

    return res.json(result);
  } catch (error) {
    await logSkillActivitySafe(req, {
      projectKey,
      action: skillName || "skills.execute",
      question: String(req.body?.question || skillName),
      answer: "",
      status: "error",
      errorMessage: error.message || "Erro ao executar skill.",
      durationMs: Date.now() - startedAt,
      metadata: {
        skillExecuted: skillName || "",
        skillDuration: Date.now() - startedAt,
        skillStatus: "error",
        source: "skills.execute"
      }
    });
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao executar skill." });
  }
}

module.exports = {
  listSkills,
  getSkill,
  executeSkill
};
