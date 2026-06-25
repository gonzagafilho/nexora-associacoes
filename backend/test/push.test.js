const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");
const webpush = require("web-push");

const PushSubscription = require("../src/models/PushSubscription");
const Notification = require("../src/models/Notification");
const User = require("../src/models/User");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";
const subscriptionId = "507f1f77bcf86cd799439301";

const originals = {
  countDocuments: PushSubscription.countDocuments,
  findOneAndUpdate: PushSubscription.findOneAndUpdate,
  deleteMany: PushSubscription.deleteMany,
  find: PushSubscription.find,
  deleteOne: PushSubscription.deleteOne,
  notificationInsertMany: Notification.insertMany,
  notificationUpdateOne: Notification.updateOne,
  userFind: User.find,
  sendNotification: webpush.sendNotification,
  setVapidDetails: webpush.setVapidDetails,
  vapidPublic: process.env.VAPID_PUBLIC_KEY,
  vapidPrivate: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT
};

const store = [];
let lastUpdate = null;
let deletedFilter = null;
let sentPayloads = [];
let sequence = 0;

function authToken(role = "owner", currentTenantId = tenantId, currentUserId = userId) {
  return jwt.sign(
    { sub: currentUserId, tenantId: currentTenantId, role, email: "owner@nexora.test", enabledModules: ["core"] },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => String(doc[key]) === String(expected));
}

function installPushMocks() {
  PushSubscription.countDocuments = async (filter = {}) => store.filter((item) => matchesFilter(item, filter)).length;
  PushSubscription.findOneAndUpdate = (filter = {}, update = {}) => ({
    async lean() {
      let item = store.find((entry) => matchesFilter(entry, filter));
      if (!item) {
        item = { _id: subscriptionId, ...update.$setOnInsert, ...filter };
        store.push(item);
      }
      Object.assign(item, update.$set || {});
      lastUpdate = { filter: clone(filter), update: clone(update) };
      return clone(item);
    }
  });
  PushSubscription.deleteMany = async (filter = {}) => {
    let deletedCount = 0;
    for (let index = store.length - 1; index >= 0; index -= 1) {
      if (!matchesFilter(store[index], filter)) continue;
      store.splice(index, 1);
      deletedCount += 1;
    }
    return { deletedCount };
  };
  PushSubscription.find = (filter = {}) => ({
    async lean() {
      return clone(store.filter((item) => matchesFilter(item, filter)));
    }
  });
  PushSubscription.deleteOne = async (filter = {}) => {
    deletedFilter = clone(filter);
    const index = store.findIndex((item) => matchesFilter(item, filter));
    if (index >= 0) store.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };
}

function installNotificationMocks() {
  Notification.insertMany = async (docs = []) => docs.map((payload) => {
    sequence += 1;
    return { _id: "507f1f77bcf86cd799439" + String(400 + sequence), createdAt: new Date(), ...payload };
  });
  Notification.updateOne = async () => ({ modifiedCount: 1 });
  User.find = () => ({
    select() {
      return { lean: async () => [{ _id: userId }] };
    }
  });
}

async function withServer(callback) {
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

beforeEach(() => {
  store.splice(0, store.length);
  lastUpdate = null;
  deletedFilter = null;
  sentPayloads = [];
  sequence = 0;
  process.env.VAPID_PUBLIC_KEY = "public-test-key";
  process.env.VAPID_PRIVATE_KEY = "private-test-key";
  process.env.VAPID_SUBJECT = "mailto:suporte@nexoracloud.com.br";
  installPushMocks();
  installNotificationMocks();
  webpush.setVapidDetails = () => undefined;
  webpush.sendNotification = async (_subscription, payload) => {
    sentPayloads.push(JSON.parse(payload));
    return { statusCode: 201 };
  };
});

afterEach(() => {
  PushSubscription.countDocuments = originals.countDocuments;
  PushSubscription.findOneAndUpdate = originals.findOneAndUpdate;
  PushSubscription.deleteMany = originals.deleteMany;
  PushSubscription.find = originals.find;
  PushSubscription.deleteOne = originals.deleteOne;
  Notification.insertMany = originals.notificationInsertMany;
  Notification.updateOne = originals.notificationUpdateOne;
  User.find = originals.userFind;
  webpush.sendNotification = originals.sendNotification;
  webpush.setVapidDetails = originals.setVapidDetails;
  if (originals.vapidPublic === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = originals.vapidPublic;
  if (originals.vapidPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = originals.vapidPrivate;
  if (originals.vapidSubject === undefined) delete process.env.VAPID_SUBJECT; else process.env.VAPID_SUBJECT = originals.vapidSubject;
  ["../src/app", "../src/modules/push/push.routes", "../src/services/push/pushNotificationService", "../src/services/notifications/notificationService"].forEach((modulePath) => {
    try { delete require.cache[require.resolve(modulePath)]; } catch (_error) {}
  });
});

test("subscribe salva subscription por tenant, user e endpoint", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ endpoint: "https://push.test/1", keys: { p256dh: "p256", auth: "auth" }, userAgent: "Chrome" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.active, true);
    assert.equal(store.length, 1);
    assert.equal(String(lastUpdate.filter.tenantId), tenantId);
    assert.equal(String(lastUpdate.filter.userId), userId);
    assert.equal(lastUpdate.filter.endpoint, "https://push.test/1");
  });
});

test("subscribe atualiza se endpoint já existe", async () => {
  store.push({ _id: subscriptionId, tenantId, userId, endpoint: "https://push.test/1", keys: { p256dh: "old", auth: "old" } });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ endpoint: "https://push.test/1", keys: { p256dh: "new", auth: "newauth" } })
    });
    assert.equal(response.status, 201);
    assert.equal(store.length, 1);
    assert.equal(store[0].keys.p256dh, "new");
  });
});

test("unsubscribe remove inscrição do usuário logado e status retorna inativo", async () => {
  store.push({ _id: subscriptionId, tenantId, userId, endpoint: "https://push.test/1", keys: { p256dh: "p", auth: "a" } });
  await withServer(async (baseUrl) => {
    const removed = await fetch(baseUrl + "/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken() },
      body: JSON.stringify({ endpoint: "https://push.test/1" })
    });
    assert.equal(removed.status, 200);
    assert.equal(store.length, 0);
    const status = await fetch(baseUrl + "/api/push/status", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await status.json();
    assert.equal(body.active, false);
  });
});

test("status retorna ativo sem permitir subscription de outro tenant", async () => {
  store.push({ _id: subscriptionId, tenantId: otherTenantId, userId, endpoint: "https://push.test/other", keys: { p256dh: "p", auth: "a" } });
  await withServer(async (baseUrl) => {
    const status = await fetch(baseUrl + "/api/push/status", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await status.json();
    assert.equal(body.active, false);
    assert.equal(body.count, 0);
  });
});

test("vapid-public-key não expõe private key", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/push/vapid-public-key", { headers: { Authorization: "Bearer " + authToken() } });
    const body = await response.json();
    assert.equal(body.publicKey, "public-test-key");
    assert.equal(body.enabled, true);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "privateKey"), false);
  });
});

test("push service remove endpoint inválido", async () => {
  store.push({ _id: subscriptionId, tenantId, userId, endpoint: "https://push.test/dead", keys: { p256dh: "p", auth: "a" } });
  webpush.sendNotification = async () => { const error = new Error("gone"); error.statusCode = 410; throw error; };
  const service = require("../src/services/push/pushNotificationService");
  const result = await service.sendPushToUser(userId, tenantId, { title: "Teste", body: "Mensagem" });
  assert.equal(result.removed, 1);
  assert.equal(String(deletedFilter._id), subscriptionId);
});

test("createNotification chama push sem quebrar", async () => {
  store.push({ _id: subscriptionId, tenantId, userId, endpoint: "https://push.test/live", keys: { p256dh: "p", auth: "a" } });
  webpush.sendNotification = async () => { throw new Error("falha simulada"); };
  const service = require("../src/services/notifications/notificationService");
  const result = await service.createNotification({
    tenantId,
    userId,
    title: "Alerta",
    message: "Mensagem resumida",
    module: "protocols",
    allowWhenDisconnected: true
  });
  assert.equal(result.length, 1);
});

test("test push retorna ok", async () => {
  store.push({ _id: subscriptionId, tenantId, userId, endpoint: "https://push.test/live", keys: { p256dh: "p", auth: "a" } });
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken("owner") },
      body: JSON.stringify({ title: "Teste NEXORA", message: "Push funcionando no PWA" })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.push.sent, 1);
    assert.equal(sentPayloads[0].title, "Teste NEXORA");
  });
});
