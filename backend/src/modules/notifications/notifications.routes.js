const express = require("express");

const auth = require("../../middlewares/auth");
const {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getDashboard,
  ensureAutomaticNotifications
} = require("../../services/notifications/notificationService");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  await ensureAutomaticNotifications({ tenantId: req.user.tenantId });
  const items = await listNotifications({ tenantId: req.user.tenantId, userId: req.user.id, limit: req.query.limit || 50 });
  return res.json({ ok: true, notifications: items });
});

router.get("/unread-count", auth, async (req, res) => {
  await ensureAutomaticNotifications({ tenantId: req.user.tenantId });
  const unread = await getUnreadCount({ tenantId: req.user.tenantId, userId: req.user.id });
  return res.json({ ok: true, unread });
});

router.get("/dashboard", auth, async (req, res) => {
  await ensureAutomaticNotifications({ tenantId: req.user.tenantId });
  const summary = await getDashboard({ tenantId: req.user.tenantId, userId: req.user.id });
  return res.json({ ok: true, ...summary });
});

router.post("/:id/read", auth, async (req, res) => {
  const notification = await markAsRead({ tenantId: req.user.tenantId, userId: req.user.id, id: req.params.id });
  if (!notification) return res.status(404).json({ ok: false, message: "Notificação não encontrada." });
  return res.json({ ok: true, notification });
});

router.post("/read-all", auth, async (req, res) => {
  const updated = await markAllAsRead({ tenantId: req.user.tenantId, userId: req.user.id });
  return res.json({ ok: true, updated });
});

router.delete("/:id", auth, async (req, res) => {
  const removed = await deleteNotification({ tenantId: req.user.tenantId, userId: req.user.id, id: req.params.id });
  if (!removed) return res.status(404).json({ ok: false, message: "Notificação não encontrada." });
  return res.json({ ok: true });
});

module.exports = router;