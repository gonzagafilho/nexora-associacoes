const express = require("express");

const auth = require("../../middlewares/auth");
const PushSubscription = require("../../models/PushSubscription");
const { getPublicKeyInfo, sendPushToUser } = require("../../services/push/pushNotificationService");

const router = express.Router();

function clean(value) {
  return String(value || "").trim();
}

function requirePushAdmin(req, res, next) {
  const allowedRoles = new Set(["owner", "admin", "superadmin"]);
  if (!allowedRoles.has(req.user?.role)) return res.status(403).json({ ok: false, message: "Acesso administrativo necessário." });
  return next();
}

function subscriptionPayload(body = {}) {
  const endpoint = clean(body.endpoint);
  const p256dh = clean(body.keys?.p256dh);
  const authKey = clean(body.keys?.auth);
  if (!endpoint || !p256dh || !authKey) return null;
  return {
    endpoint,
    keys: { p256dh, auth: authKey },
    userAgent: clean(body.userAgent).slice(0, 500)
  };
}

router.get("/vapid-public-key", auth, (req, res) => {
  const info = getPublicKeyInfo();
  return res.json({ ok: true, publicKey: info.publicKey, enabled: info.enabled });
});

router.get("/status", auth, async (req, res) => {
  const count = await PushSubscription.countDocuments({ tenantId: req.user.tenantId, userId: req.user.id });
  const info = getPublicKeyInfo();
  return res.json({ ok: true, active: count > 0, count, enabled: info.enabled, publicKey: info.publicKey });
});

router.post("/subscribe", auth, async (req, res) => {
  const payload = subscriptionPayload(req.body || {});
  if (!payload) return res.status(400).json({ ok: false, message: "Subscription inválida." });

  const subscription = await PushSubscription.findOneAndUpdate(
    { tenantId: req.user.tenantId, userId: req.user.id, endpoint: payload.endpoint },
    {
      $set: {
        keys: payload.keys,
        userAgent: payload.userAgent,
        updatedAt: new Date()
      },
      $setOnInsert: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        endpoint: payload.endpoint,
        createdAt: new Date()
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return res.status(201).json({ ok: true, active: true, subscriptionId: subscription?._id || null });
});

router.delete("/unsubscribe", auth, async (req, res) => {
  const endpoint = clean(req.body?.endpoint);
  const filter = { tenantId: req.user.tenantId, userId: req.user.id };
  if (endpoint) filter.endpoint = endpoint;
  const result = await PushSubscription.deleteMany(filter);
  return res.json({ ok: true, active: false, removed: Number(result.deletedCount || 0) });
});

router.post("/test", auth, requirePushAdmin, async (req, res) => {
  const title = clean(req.body?.title) || "Teste NEXORA";
  const body = clean(req.body?.message) || "Push funcionando no PWA";
  const result = await sendPushToUser(req.user.id, req.user.tenantId, {
    title,
    body,
    url: "/#notificacoes",
    module: "saas",
    severity: "low"
  });
  return res.json({ ok: true, push: result });
});

module.exports = router;
