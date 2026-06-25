const express = require("express");
const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const workflowService = require("../services/workflowService");

const router = express.Router();

function getTenantId(req) {
  return req.user?.tenantId || req.query?.tenantId || req.body?.tenantId;
}

function buildExecutionContext(req) {
  return {
    tenantId: req.user?.tenantId,
    userId: req.user?.id,
    role: req.user?.role,
    ip: req.ip
  };
}

function sendError(res, error) {
  const status = Number(error?.status || 500);
  return res.status(status).json({
    error: error?.message || "Erro ao processar workflow.",
    details: error?.details || []
  });
}

router.use(auth, requireModule("core"));

router.get("/", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const workflows = await workflowService.listWorkflows(tenantId);
    res.json({ workflows });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const workflow = await workflowService.createWorkflow(tenantId, req.body || {}, req.user?.id);
    res.status(201).json({ workflow });
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const workflow = await workflowService.updateWorkflow(tenantId, req.params.id, req.body || {}, req.user?.id);
    res.json({ workflow });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await workflowService.deleteWorkflow(tenantId, req.params.id);
    res.json({ success: deleted });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/run", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await workflowService.runWorkflowNow(
      tenantId,
      req.params.id,
      req.body?.payload || {},
      buildExecutionContext(req)
    );
    res.json({ result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/enable", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const workflow = await workflowService.setWorkflowEnabled(tenantId, req.params.id, true, req.user?.id);
    res.json({ workflow });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/disable", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const workflow = await workflowService.setWorkflowEnabled(tenantId, req.params.id, false, req.user?.id);
    res.json({ workflow });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const dashboard = await workflowService.getWorkflowDashboard(tenantId);
    res.json({ dashboard });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/executions", async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const executions = await workflowService.listExecutions(tenantId, req.query?.limit);
    res.json({ executions });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
