const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Notification = require("../src/models/Notification");
const User = require("../src/models/User");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const secondUserId = "507f191e810c19729de860eb";

const originals = {
  notificationInsertMany: Notification.insertMany,
  notificationFind: Notification.find,
  notificationCountDocuments: Notification.countDocuments,
  notificationFindOneAndUpdate: Notification.findOneAndUpdate,
  notificationUpdateMany: Notification.updateMany,
  notificationDeleteOne: Notification.deleteOne,
  userFind: User.find,
  disableSync: process.env.NOTIFICATIONS_DISABLE_SYNC
};

const store = [];
let sequence = 0;

function authToken(currentTenantId = tenantId, currentUserId = userId) {
  return jwt.sign(
    { sub: currentUserId, tenantId: currentTenantId, role: "owner", email: "owner@nexora.test", enabledModules: ["core", "financial", "protocols", "assets", "projects", "associates"] },
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

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
      return Array.isArray(expected) ? expected.some((item) => matchesFilter(doc, item)) : false;
    }
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("$gte" in expected || "$lte" in expected) {
        const valueDate = asDate(doc[key]);
        if (!valueDate) return false;
        if (expected.$gte && valueDate < asDate(expected.$gte)) return false;
        if (expected.$lte && valueDate > asDate(expected.$lte)) return false;
        return true;
      }
      return String(doc[key]) === String(expected);
    }
    return String(doc[key]) === String(expected);
  });
}

function queryBuilder(items) {
  let result = [...items];
  return {
    sort(sortValue) {
      if (sortValue?.createdAt) {
        const direction = Number(sortValue.createdAt);
        result.sort((left, right) => direction < 0
          ? asDate(right.createdAt) - asDate(left.createdAt)
          : asDate(left.createdAt) - asDate(right.createdAt));
      }
      return this;
    },
    skip(skipValue) {
      result = result.slice(Number(skipValue || 0));
      return this;
    },
    limit(limitValue) {
      result = result.slice(0, Number(limitValue || result.length));
      return this;
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
      const dedupeKey = String(payload.dedupeKey || "").trim();
      if (dedupeKey) {
        const duplicate = store.find((item) => String(item.tenantId) === String(payload.tenantId) && String(item.userId) === String(payload.userId) && String(item.dedupeKey || "") === dedupeKey);
        if (duplicate) continue;
      }
      sequence += 1;
      const now = new Date(Date.now() + sequence * 1000);
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
        createdAt: now
      };
      store.push(doc);
      created.push(clone(doc));
    }
    return created;
  };

  Notification.find = (filter = {}) => queryBuilder(store.filter((item) => matchesFilter(item, filter)));
  Notification.countDocuments = async (filter = {}) => store.filter((item) => matchesFilter(item, filter)).length;

  Notification.findOneAndUpdate = (filter = {}, update = {}) => ({
    async lean() {
      const index = store.findIndex((item) => matchesFilter(item, filter));
      if (index < 0) return null;
      const patch = update.$set || {};
      store[index] = { ...store[index], ...patch };
      return clone(store[index]);
    }
  });

  Notification.updateMany = async (filter = {}, update = {}) => {
    const patch = update.$set || {};
    let modifiedCount = 0;
    for (let index = 0; index < store.length; index += 1) {
      if (!matchesFilter(store[index], filter)) continue;
      store[index] = { ...store[index], ...patch };
      modifiedCount += 1;
    }
    return { modifiedCount };
  };

  Notification.deleteOne = async (filter = {}) => {
    const index = store.findIndex((item) => matchesFilter(item, filter));
    if (index < 0) return { deletedCount: 0 };
    store.splice(index, 1);
    return { deletedCount: 1 };
  };

  User.find = () => ({
    select() {
      return {
        async lean() {
          return [{ _id: userId }, { _id: secondUserId }];
        }
      };
    }
  });
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
  store.splice(0, store.length);
  sequence = 0;
  process.env.NOTIFICATIONS_DISABLE_SYNC = "1";
  installMocks();
});

afterEach(() => {
  Notification.insertMany = originals.notificationInsertMany;
  Notification.find = originals.notificationFind;
  Notification.countDocuments = originals.notificationCountDocuments;
  Notification.findOneAndUpdate = originals.notificationFindOneAndUpdate;
  Notification.updateMany = originals.notificationUpdateMany;
  Notification.deleteOne = originals.notificationDeleteOne;
  User.find = originals.userFind;
  if (originals.disableSync === undefined) delete process.env.NOTIFICATIONS_DISABLE_SYNC;
  else process.env.NOTIFICATIONS_DISABLE_SYNC = originals.disableSync;
  delete require.cache[require.resolve("../src/modules/notifications/notifications.routes")];
  delete require.cache[require.resolve("../src/services/notifications/notificationService")];
  delete require.cache[require.resolve("../src/app")];
});

test("createNotification cria notificações para usuários do tenant", async () => {
  const service = require("../src/services/notifications/notificationService");
  const result = await service.createNotification({
    tenantId,
    title: "Protocolo criado",
    message: "PROTO-000101 foi registrado.",
    type: "info",
    severity: "low",
    module: "protocols",
    referenceId: "507f1f77bcf86cd799439181",
    referenceType: "protocol",
    dedupeKey: "protocol-created-101",
    allowWhenDisconnected: true
  });

  assert.equal(result.length, 2);
  assert.equal(store.length, 2);
  assert.equal(store[0].module, "protocols");
});

test("GET /api/notifications lista notificações do usuário", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "A", message: "msg-a", type: "info", severity: "low", module: "projects", dedupeKey: "a", allowWhenDisconnected: true });
  await service.createNotification({ tenantId, userId, title: "B", message: "msg-b", type: "warning", severity: "high", module: "assets", dedupeKey: "b", allowWhenDisconnected: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.notifications.length, 2);
    assert.equal(body.notifications[0].title, "B");
  });
});

test("GET /api/notifications/unread-count retorna contador de não lidas", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "A", message: "m1", type: "info", severity: "low", module: "projects", dedupeKey: "c1", allowWhenDisconnected: true });
  await service.createNotification({ tenantId, userId, title: "B", message: "m2", type: "info", severity: "low", module: "projects", dedupeKey: "c2", allowWhenDisconnected: true });
  await service.markAsRead({ tenantId, userId, id: store[0]._id });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.unread, 1);
  });
});

test("POST /api/notifications/:id/read marca notificação como lida", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "Ler", message: "msg", type: "info", severity: "low", module: "financial", dedupeKey: "read-one", allowWhenDisconnected: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/${store[0]._id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.notification.isRead, true);
  });
});

test("POST /api/notifications/read-all marca todas como lidas", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "Um", message: "m", type: "info", severity: "low", module: "assets", dedupeKey: "ra-1", allowWhenDisconnected: true });
  await service.createNotification({ tenantId, userId, title: "Dois", message: "m", type: "warning", severity: "medium", module: "protocols", dedupeKey: "ra-2", allowWhenDisconnected: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.updated, 2);
    assert.equal(store.every((item) => item.isRead === true), true);
  });
});

test("DELETE /api/notifications/:id remove notificação", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "Excluir", message: "m", type: "error", severity: "critical", module: "saas", dedupeKey: "del-1", allowWhenDisconnected: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/${store[0]._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(store.length, 0);
  });
});

test("Notificações respeitam isolamento multi-tenant", async () => {
  const service = require("../src/services/notifications/notificationService");
  await service.createNotification({ tenantId, userId, title: "Tenant A", message: "m", type: "info", severity: "low", module: "projects", dedupeKey: "iso-a", allowWhenDisconnected: true });
  await service.createNotification({ tenantId: otherTenantId, userId, title: "Tenant B", message: "m", type: "info", severity: "low", module: "projects", dedupeKey: "iso-b", allowWhenDisconnected: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${authToken(otherTenantId)}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.notifications.length, 1);
    assert.equal(body.notifications[0].tenantId, otherTenantId);
    assert.equal(body.notifications[0].title, "Tenant B");
  });
});