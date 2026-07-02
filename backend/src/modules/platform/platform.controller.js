const platformService = require("../../platform/platform.service");

function requestContext(req) {
  return {
    tenantId: req.user.tenantId,
    userId: req.user.id,
    userRole: req.user.role,
    role: req.user.role,
    userEmail: req.user.email,
    enabledModules: req.user.enabledModules,
    projectKey: String(req.query.projectKey || req.body?.projectKey || "associacoes").trim().toLowerCase() || "associacoes"
  };
}

async function getApps(_req, res) {
  try {
    const result = await platformService.listApps();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao listar apps da plataforma." });
  }
}

async function getStatus(req, res) {
  try {
    const result = await platformService.platformStatus(requestContext(req));
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao carregar status da plataforma." });
  }
}

async function getCore(req, res) {
  try {
    const result = await platformService.coreOverview(requestContext(req));
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao carregar core da plataforma." });
  }
}

async function getModules(_req, res) {
  try {
    const result = platformService.modulesOverview();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Erro ao listar módulos da plataforma." });
  }
}

async function getAppDashboard(req, res) {
  try {
    const context = requestContext(req);
    const appId = String(req.params.appId || "").trim().toLowerCase();
    const result = await platformService.appDashboard({ ...context, appId });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao carregar dashboard do app." });
  }
}

module.exports = {
  getApps,
  getStatus,
  getCore,
  getModules,
  getAppDashboard
};
