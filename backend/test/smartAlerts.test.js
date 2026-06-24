const assert = require("node:assert/strict");
const { beforeEach, afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Notification = require("../src/models/Notification");
const User = require("../src/models/User");
const Protocol = require("../src/models/Protocol");
const Project = require("../src/models/Project");
const Asset = require("../src/models/Asset");
const FinancialTransaction = require("../src/models/FinancialTransaction");
const TenantSubscription = require("../src/models/TenantSubscription");
const Tenant = require("../src/models/Tenant");

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

const originals = {
  notificationInsertMany: Notification.insertMany,
  notificationCountDocuments: Notification.countDocuments,
  notificationFind: Notification.find,
  userFind: User.find,
  protocolFind: Protocol.find,
  projectFind: Project.find,
  assetFind: Asset.find,
  financialFind: FinancialTransaction.find,
  subscriptionFind: TenantSubscription.find,
  tenantFind: Tenant.find
};

const notificationsStore = [];
const protocolsStore = [];
const projectsStore = [];
const assetsStore = [];
const financialStore = [];
const subscriptionsStore = [];
const tenantsStore = [{ _id: tenantId, status: "active" }];
let sequence = 0;

function authToken(role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId, role, email: "owner@nexora.test", enabledModules: ["core", "financial", "protocols", "assets", "projects"] },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asDate(value) {
  return value ? new Date(value) : null;
}

function matchScalar(actual, expected) {
  if (expected && typeof expected === "object" && !(expected instanceof Date)) {
    if ("$in" in expected) return expected.$in.map(String).includes(String(actual));
    if ("$nin" in expected) return !expected.$nin.map(String).includes(String(actual));
    if ("$lt" in expected || "$lte" in expected || "$gte" in expected || "$gt" in expected) {
      const actualDate = asDate(actual);
      if (!actualDate) return false;
      if (expected.$lt && !(actualDate < asDate(expected.$lt))) return false;
      if (expected.$lte && !(actualDate <= asDate(expected.$lte))) return false;
      if (expected.$gte && !(actualDate >= asDate(expected.$gte))) return false;
      if (expected.$gt && !(actualDate > asDate(expected.$gt))) return false;
      return true;
    }
  }
  return String(actual) === String(expected);
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
      return Array.isArray(expected) ? expected.some((item) => matchesFilter(doc, item)) : false;
    }
    return matchScalar(doc[key], expected);
  });
}

function plainFind(store, filter = {}) {
  const result = store.filter((item) => matchesFilter(item, filter));
  return {
    select() {
      return {
        async lean() {
          return clone(result);
        }
      };
    },
    sort(sortValue) {
      const ordered = [...result];
      if (sortValue?.createdAt) {
        const direction = Number(sortValue.createdAt);
        ordered.sort((left, right) => direction < 0
          ? asDate(right.createdAt) - asDate(left.createdAt)
          : asDate(left.createdAt) - asDate(right.createdAt));
      }
      return {
        limit(limitValue) {
          const sliced = ordered.slice(0, Number(limitValue || ordered.length));
          return {
            async lean() {
              return clone(sliced);
            }
          };
        }
      };
    },
    async lean() {
      return clone(result);
    }
  };
}

function installMocks() {
  Notification.insertMany = async (docs = []) => {
    const created = [];
    for (const payload of docs) {
      sequence += 1;
      const doc = {
        _id: `507f1f77bcf86cd79944${String(sequence).padStart(4, "0")}`,
        tenantId: payload.tenantId,
        userId: payload.userId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        severity: payload.severity,
        module: payload.module,
        referenceId: payload.referenceId || "",
        referenceType: payload.referenceType || "",
        isRead: Boolean(payload.isRead),
        readAt: payload.readAt || null,
        dedupeKey: payload.dedupeKey || "",
        createdAt: payload.createdAt || new Date()
      };
      notificationsStore.push(doc);
      created.push(clone(doc));
    }
    return created;
  };

  Notification.countDocuments = async (filter = {}) => notificationsStore.filter((item) => matchesFilter(item, filter)).length;
  Notification.find = (filter = {}) => plainFind(notificationsStore, filter);

  User.find = () => ({
    select() {
      return {
        async lean() {
          return [{ _id: userId }];
        }
      };
    }
  });

  Protocol.find = (filter = {}) => plainFind(protocolsStore, filter);
  Project.find = (filter = {}) => plainFind(projectsStore, filter);
  Asset.find = (filter = {}) => plainFind(assetsStore, filter);
  FinancialTransaction.find = (filter = {}) => plainFind(financialStore, filter);
  TenantSubscription.find = (filter = {}) => plainFind(subscriptionsStore, filter);
  Tenant.find = (filter = {}) => plainFind(tenantsStore, filter);
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

beforeEach(() => {
  notificationsStore.splice(0, notificationsStore.length);
  protocolsStore.splice(0, protocolsStore.length);
  projectsStore.splice(0, projectsStore.length);
  assetsStore.splice(0, assetsStore.length);
  financialStore.splice(0, financialStore.length);
  subscriptionsStore.splice(0, subscriptionsStore.length);
  sequence = 0;
  installMocks();
});

afterEach(() => {
  Notification.insertMany = originals.notificationInsertMany;
  Notification.countDocuments = originals.notificationCountDocuments;
  Notification.find = originals.notificationFind;
  User.find = originals.userFind;
  Protocol.find = originals.protocolFind;
  Project.find = originals.projectFind;
  Asset.find = originals.assetFind;
  FinancialTransaction.find = originals.financialFind;
  TenantSubscription.find = originals.subscriptionFind;
  Tenant.find = originals.tenantFind;
  delete require.cache[require.resolve("../src/app")];
  delete require.cache[require.resolve("../src/modules/notifications/notifications.routes")];
  delete require.cache[require.resolve("../src/services/notifications/smartAlertService")];
});

test("protocolo vencido gera notificação", async () => {
  const { runSmartAlerts } = require("../src/services/notifications/smartAlertService");
  const now = new Date("2026-06-24T10:00:00.000Z");

  protocolsStore.push({
    _id: "507f1f77bcf86cd799439181",
    tenantId,
    protocolNumber: "PROTO-000001",
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    status: "open"
  });

  const summary = await runSmartAlerts({ tenantId, now });

  assert.equal(summary.created, 1);
  const created = notificationsStore.find((item) => item.referenceType === "protocol_overdue");
  assert.equal(Boolean(created), true);
  assert.equal(created.severity, "high");
});

test("protocolo urgente sem responsável gera crítica", async () => {
  const { runSmartAlerts } = require("../src/services/notifications/smartAlertService");
  const now = new Date("2026-06-24T10:00:00.000Z");

  protocolsStore.push({
    _id: "507f1f77bcf86cd799439182",
    tenantId,
    protocolNumber: "PROTO-000002",
    priority: "urgent",
    assignedToName: "",
    status: "open"
  });

  await runSmartAlerts({ tenantId, now });

  const created = notificationsStore.find((item) => item.referenceType === "protocol_urgent_without_responsible");
  assert.equal(Boolean(created), true);
  assert.equal(created.severity, "critical");
});

test("projeto vencendo gera notificação", async () => {
  const { runSmartAlerts } = require("../src/services/notifications/smartAlertService");
  const now = new Date("2026-06-24T10:00:00.000Z");

  projectsStore.push({
    _id: "507f1f77bcf86cd799439071",
    tenantId,
    name: "Reforma da sede",
    endDate: new Date("2026-06-29T00:00:00.000Z"),
    status: "active"
  });

  await runSmartAlerts({ tenantId, now });

  const created = notificationsStore.find((item) => item.referenceType === "project_ending_soon");
  assert.equal(Boolean(created), true);
  assert.equal(created.severity, "medium");
});

test("despesa vencida gera notificação", async () => {
  const { runSmartAlerts } = require("../src/services/notifications/smartAlertService");
  const now = new Date("2026-06-24T10:00:00.000Z");

  financialStore.push({
    _id: "507f1f77bcf86cd799439041",
    tenantId,
    type: "expense",
    status: "pending",
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    description: "Conta de energia"
  });

  await runSmartAlerts({ tenantId, now });

  const created = notificationsStore.find((item) => item.referenceType === "financial_overdue");
  assert.equal(Boolean(created), true);
  assert.equal(created.title, "Despesa vencida");
  assert.equal(created.severity, "high");
});

test("não duplica notificação existente", async () => {
  const { runSmartAlerts } = require("../src/services/notifications/smartAlertService");
  const now = new Date("2026-06-24T10:00:00.000Z");

  financialStore.push({
    _id: "507f1f77bcf86cd799439042",
    tenantId,
    type: "expense",
    status: "pending",
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    description: "Conta de internet"
  });

  notificationsStore.push({
    _id: "507f1f77bcf86cd799449999",
    tenantId,
    userId,
    title: "Despesa vencida",
    message: "Já existe",
    type: "warning",
    severity: "high",
    module: "financial",
    referenceType: "financial_overdue",
    referenceId: "507f1f77bcf86cd799439042",
    isRead: false,
    createdAt: now
  });

  const summary = await runSmartAlerts({ tenantId, now });

  assert.equal(summary.created, 0);
  assert.equal(summary.skipped >= 1, true);
  const total = notificationsStore.filter((item) => item.referenceType === "financial_overdue" && item.referenceId === "507f1f77bcf86cd799439042").length;
  assert.equal(total, 1);
});

test("endpoint manual executa alertas", async () => {
  protocolsStore.push({
    _id: "507f1f77bcf86cd799439183",
    tenantId,
    protocolNumber: "PROTO-000003",
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    status: "open"
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/run-smart-alerts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken("owner")}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.created >= 1, true);
    assert.equal(typeof body.skipped, "number");
    assert.equal(typeof body.errors, "number");
  });
});

test("dashboard retorna smartAlertsToday", async () => {
  const now = new Date();

  notificationsStore.push({
    _id: "507f1f77bcf86cd799448881",
    tenantId,
    userId,
    title: "Smart",
    message: "Alerta smart",
    type: "warning",
    severity: "high",
    module: "protocols",
    referenceType: "protocol_overdue",
    referenceId: "507f1f77bcf86cd799439181",
    isRead: false,
    createdAt: now
  });

  notificationsStore.push({
    _id: "507f1f77bcf86cd799448882",
    tenantId,
    userId,
    title: "Comum",
    message: "Alerta comum",
    type: "info",
    severity: "low",
    module: "projects",
    referenceType: "project",
    referenceId: "507f1f77bcf86cd799439071",
    isRead: false,
    createdAt: now
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/dashboard`, {
      headers: { Authorization: `Bearer ${authToken("owner")}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.smartAlertsToday, 1);
  });
});
