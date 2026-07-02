const aiActivityLogService = require("./aiActivityLog.service");

async function list(req, res) {
  try {
    const logs = await aiActivityLogService.listActivityLogs({
      tenantId: req.user.tenantId,
      query: req.query || {}
    });
    return res.json({ ok: true, logs });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao listar activity logs." });
  }
}

async function stats(req, res) {
  try {
    const data = await aiActivityLogService.getActivityLogStats({
      tenantId: req.user.tenantId,
      query: req.query || {}
    });
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao carregar stats de activity logs." });
  }
}

async function getById(req, res) {
  try {
    const log = await aiActivityLogService.getActivityLogById({
      tenantId: req.user.tenantId,
      id: req.params.id
    });
    if (!log) return res.status(404).json({ ok: false, message: "Activity log não encontrado." });
    return res.json({ ok: true, log });
  } catch (error) {
    return res.status(error.statusCode || 404).json({ ok: false, message: error.message || "Activity log não encontrado." });
  }
}

module.exports = {
  list,
  stats,
  getById
};
