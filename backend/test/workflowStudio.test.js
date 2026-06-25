const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Workflow = require("../src/workflow/models/Workflow");
const WorkflowExecution = require("../src/workflow/models/WorkflowExecution");
const workflowService = require("../src/workflow/services/workflowService");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

const originals = {
  workflowFind: Workflow.find,
  workflowFindOne: Workflow.findOne,
  workflowCreate: Workflow.create,
  workflowCountDocuments: Workflow.countDocuments,
  executionFind: WorkflowExecution.find,
  executionAggregate: WorkflowExecution.aggregate,
  serviceRunWorkflowNow: workflowService.runWorkflowNow
};

afterEach(() => {
  Workflow.find = originals.workflowFind;
  Workflow.findOne = originals.workflowFindOne;
  Workflow.create = originals.workflowCreate;
  Workflow.countDocuments = originals.workflowCountDocuments;
  WorkflowExecution.find = originals.executionFind;
  WorkflowExecution.aggregate = originals.executionAggregate;
  workflowService.runWorkflowNow = originals.serviceRunWorkflowNow;
  delete require.cache[require.resolve("../src/workflow/routes/workflow.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(enabledModules = ["core", "financial"]) {
  return jwt.sign(
    { sub: userId, tenantId, role: "owner", email: "owner@nexora.test", enabledModules },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

async function withServer(callback) {
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function stubWorkflowFind(rows) {
  Workflow.find = () => ({
    sort() {
      return {
        lean: async () => rows,
        limit() {
          return { lean: async () => rows };
        }
      };
    }
  });
}

function stubExecutionFind(rows) {
  WorkflowExecution.find = () => ({
    sort() {
      return {
        limit() {
          return { lean: async () => rows };
        }
      };
    }
  });
}

test("GET /api/workflows lista workflows do tenant", async () => {
  stubWorkflowFind([
    {
      _id: "507f1f77bcf86cd799439701",
      tenantId,
      name: "Cobrança vencida",
      enabled: true,
      trigger: { type: "event", eventName: "invoice.overdue" },
      actions: [{ type: "sendNotification" }]
    }
  ]);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/workflows", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.workflows), true);
    assert.equal(body.workflows.length, 1);
    assert.equal(body.workflows[0].name, "Cobrança vencida");
  });
});

test("POST /api/workflows cria workflow", async () => {
  Workflow.create = async (payload) => ({
    _id: "507f1f77bcf86cd799439702",
    ...payload
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({
        name: "Onboarding associado",
        description: "Fluxo inicial",
        trigger: { type: "event", eventName: "associate.created" },
        actions: [{ type: "sendNotification" }]
      })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.workflow.name, "Onboarding associado");
  });
});

test("GET /api/workflows/dashboard retorna métricas", async () => {
  Workflow.countDocuments = async () => 3;
  WorkflowExecution.aggregate = async () => [
    { _id: "completed", total: 4 },
    { _id: "failed", total: 1 }
  ];
  stubExecutionFind([
    {
      _id: "507f1f77bcf86cd799439801",
      workflowId: "507f1f77bcf86cd799439701",
      tenantId,
      status: "completed",
      startedAt: new Date().toISOString(),
      duration: 120
    }
  ]);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/workflows/dashboard", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.dashboard.totalWorkflows, 3);
    assert.equal(Array.isArray(body.dashboard.statuses), true);
  });
});

test("GET /api/workflows/executions lista execuções", async () => {
  stubExecutionFind([
    {
      _id: "507f1f77bcf86cd799439802",
      workflowId: "507f1f77bcf86cd799439701",
      tenantId,
      status: "failed",
      startedAt: new Date().toISOString(),
      duration: 40,
      error: "Falha simulada"
    }
  ]);

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/workflows/executions?limit=5", {
      headers: { Authorization: "Bearer " + authToken() }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.executions), true);
    assert.equal(body.executions.length, 1);
  });
});

test("POST /api/workflows/:id/run dispara execução", async () => {
  workflowService.runWorkflowNow = async (_tenantId, workflowId) => ({
    success: true,
    workflowId,
    executionId: "507f1f77bcf86cd799439999"
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/workflows/507f1f77bcf86cd799439701/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ payload: { source: "test" } })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result.success, true);
  });
});
