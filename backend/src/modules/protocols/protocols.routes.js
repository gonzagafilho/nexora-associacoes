const express = require("express");

const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const Protocol = require("../../models/Protocol");
const ProtocolHistory = require("../../models/ProtocolHistory");
const Project = require("../../models/Project");
const Asset = require("../../models/Asset");
const Associate = require("../../models/Associate");
const {
  PROTOCOL_TYPES,
  PROTOCOL_PRIORITIES,
  PROTOCOL_STATUSES
} = require("../../models/Protocol");

const router = express.Router();
const protocolAccess = [auth, requireModule("protocols")];
const TYPE_SET = new Set(PROTOCOL_TYPES);
const PRIORITY_SET = new Set(PROTOCOL_PRIORITIES);
const STATUS_SET = new Set(PROTOCOL_STATUSES);
const CLOSED_STATUSES = new Set(["resolved", "closed", "cancelled"]);
const PRIORITY_WEIGHT = { urgent: 0, high: 1, medium: 2, low: 3 };

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

function validateDate(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} inválida.`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function parsePositiveInt(value, fallback, min = 1, max = 300) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function normalizeQueryDate(date, endOfDay = false) {
  if (!date) return undefined;
  const normalized = new Date(date);
  if (endOfDay) normalized.setHours(23, 59, 59, 999);
  else normalized.setHours(0, 0, 0, 0);
  return normalized;
}

async function validateLinkedRecord(model, tenantId, id, label, selectFields) {
  if (!id) return null;
  const record = await model.findOne({ _id: id, tenantId }).select(selectFields).lean();
  if (!record) {
    const error = new Error(`${label} não encontrado.`);
    error.statusCode = 404;
    throw error;
  }
  return record;
}

function buildProtocolPayload(body = {}, existing = {}) {
  const title = String(body.title ?? existing.title ?? "").trim();
  if (!title) {
    const error = new Error("Título do protocolo é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  const type = String(body.type ?? existing.type ?? "solicitacao").trim() || "solicitacao";
  if (!TYPE_SET.has(type)) {
    const error = new Error("Tipo de protocolo inválido.");
    error.statusCode = 400;
    throw error;
  }

  const priority = String(body.priority ?? existing.priority ?? "medium").trim() || "medium";
  if (!PRIORITY_SET.has(priority)) {
    const error = new Error("Prioridade inválida.");
    error.statusCode = 400;
    throw error;
  }

  const status = String(body.status ?? existing.status ?? "open").trim() || "open";
  if (!STATUS_SET.has(status)) {
    const error = new Error("Status inválido.");
    error.statusCode = 400;
    throw error;
  }

  const relatedProjectId = body.relatedProjectId !== undefined
    ? (body.relatedProjectId ? normalizeObjectId(body.relatedProjectId) : undefined)
    : existing.relatedProjectId;
  const relatedAssetId = body.relatedAssetId !== undefined
    ? (body.relatedAssetId ? normalizeObjectId(body.relatedAssetId) : undefined)
    : existing.relatedAssetId;
  const relatedAssociateId = body.relatedAssociateId !== undefined
    ? (body.relatedAssociateId ? normalizeObjectId(body.relatedAssociateId) : undefined)
    : existing.relatedAssociateId;

  if (body.relatedProjectId && !relatedProjectId) {
    const error = new Error("Projeto relacionado inválido.");
    error.statusCode = 400;
    throw error;
  }
  if (body.relatedAssetId && !relatedAssetId) {
    const error = new Error("Patrimônio relacionado inválido.");
    error.statusCode = 400;
    throw error;
  }
  if (body.relatedAssociateId && !relatedAssociateId) {
    const error = new Error("Associado relacionado inválido.");
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    description: String(body.description ?? existing.description ?? "").trim(),
    type,
    priority,
    status,
    requesterName: String(body.requesterName ?? existing.requesterName ?? "").trim(),
    requesterContact: String(body.requesterContact ?? existing.requesterContact ?? "").trim(),
    assignedToName: String(body.assignedToName ?? existing.assignedToName ?? "").trim(),
    dueDate: validateDate(body.dueDate ?? existing.dueDate, "Data de vencimento"),
    relatedProjectId,
    relatedAssetId,
    relatedAssociateId,
    notes: String(body.notes ?? existing.notes ?? "").trim()
  };
}

async function generateNextProtocolNumber(tenantId) {
  const last = await Protocol.findOne({ tenantId }).sort({ protocolNumber: -1 }).select("protocolNumber").lean();
  const sequence = Number.parseInt(String(last?.protocolNumber || "").replace(/\D/g, ""), 10) || 0;
  return `PROTO-${String(sequence + 1).padStart(6, "0")}`;
}

async function logHistory({ protocolId, tenantId, action, oldStatus = "", newStatus = "", message = "", req }) {
  return ProtocolHistory.create({
    tenantId,
    protocolId,
    action,
    oldStatus,
    newStatus,
    message: String(message || "").trim(),
    userId: req.user?.id || undefined,
    userEmail: req.user?.email || ""
  });
}

function serializeLinked(record, fallbackId, labelField = "name") {
  if (!record) return { id: fallbackId ? String(fallbackId) : null, name: "" };
  return {
    id: record._id ? String(record._id) : (fallbackId ? String(fallbackId) : null),
    name: record[labelField] || ""
  };
}

function serializeProtocol(protocol) {
  const project = protocol.relatedProjectId && typeof protocol.relatedProjectId === "object" ? protocol.relatedProjectId : null;
  const asset = protocol.relatedAssetId && typeof protocol.relatedAssetId === "object" ? protocol.relatedAssetId : null;
  const associate = protocol.relatedAssociateId && typeof protocol.relatedAssociateId === "object" ? protocol.relatedAssociateId : null;

  return {
    id: String(protocol._id),
    tenantId: String(protocol.tenantId),
    protocolNumber: protocol.protocolNumber || "",
    title: protocol.title || "",
    description: protocol.description || "",
    type: protocol.type || "solicitacao",
    priority: protocol.priority || "medium",
    status: protocol.status || "open",
    requesterName: protocol.requesterName || "",
    requesterContact: protocol.requesterContact || "",
    assignedToName: protocol.assignedToName || "",
    dueDate: protocol.dueDate || null,
    resolvedAt: protocol.resolvedAt || null,
    closedAt: protocol.closedAt || null,
    relatedProjectId: project?._id ? String(project._id) : (protocol.relatedProjectId ? String(protocol.relatedProjectId) : null),
    relatedProjectName: project?.name || "",
    relatedAssetId: asset?._id ? String(asset._id) : (protocol.relatedAssetId ? String(protocol.relatedAssetId) : null),
    relatedAssetName: asset?.name || "",
    relatedAssetCode: asset?.assetCode || "",
    relatedAssociateId: associate?._id ? String(associate._id) : (protocol.relatedAssociateId ? String(protocol.relatedAssociateId) : null),
    relatedAssociateName: associate?.name || "",
    notes: protocol.notes || "",
    createdBy: protocol.createdBy ? String(protocol.createdBy) : null,
    createdAt: protocol.createdAt || null,
    updatedAt: protocol.updatedAt || null
  };
}

function serializeHistory(entry) {
  return {
    id: String(entry._id),
    protocolId: String(entry.protocolId),
    tenantId: String(entry.tenantId),
    action: entry.action || "",
    oldStatus: entry.oldStatus || "",
    newStatus: entry.newStatus || "",
    message: entry.message || "",
    userId: entry.userId ? String(entry.userId) : null,
    userEmail: entry.userEmail || "",
    createdAt: entry.createdAt || null
  };
}

function applyResponseLinks(protocol, links = {}) {
  if (links.project) protocol.relatedProjectId = { _id: links.project._id, name: links.project.name };
  if (links.asset) protocol.relatedAssetId = { _id: links.asset._id, name: links.asset.name, assetCode: links.asset.assetCode };
  if (links.associate) protocol.relatedAssociateId = { _id: links.associate._id, name: links.associate.name };
  return protocol;
}

function buildListQuery(req) {
  const query = { tenantId: req.user.tenantId };
  if (req.query.status) query.status = String(req.query.status).trim();
  if (req.query.priority) query.priority = String(req.query.priority).trim();
  if (req.query.type) query.type = String(req.query.type).trim();

  const dateFrom = normalizeQueryDate(validateDate(req.query.dateFrom, "Data inicial"));
  const dateTo = normalizeQueryDate(validateDate(req.query.dateTo, "Data final"), true);
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = dateFrom;
    if (dateTo) query.createdAt.$lte = dateTo;
  }

  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    query.$or = [
      { protocolNumber: regex },
      { title: regex },
      { description: regex },
      { requesterName: regex },
      { requesterContact: regex },
      { assignedToName: regex },
      { notes: regex }
    ];
  }
  return query;
}

function sortProtocols(items = []) {
  return [...items].sort((left, right) => {
    const priorityDelta = (PRIORITY_WEIGHT[left.priority] ?? 99) - (PRIORITY_WEIGHT[right.priority] ?? 99);
    if (priorityDelta !== 0) return priorityDelta;

    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;

    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
}

async function populateProtocolDoc(target) {
  if (!target) return target;
  let current = target;
  if (typeof current.populate === "function") current = await current.populate("relatedProjectId", "name");
  if (typeof current.populate === "function") current = await current.populate("relatedAssetId", "name assetCode");
  if (typeof current.populate === "function") current = await current.populate("relatedAssociateId", "name");
  return current;
}

async function findProtocolOr404(req, res) {
  const found = await Protocol.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  const protocol = await populateProtocolDoc(found);

  if (!protocol) {
    res.status(404).json({ ok: false, message: "Protocolo não encontrado." });
    return null;
  }
  return protocol;
}

router.get("/dashboard", protocolAccess, async (req, res) => {
  const protocols = await Protocol.find({ tenantId: req.user.tenantId }).lean();
  const now = Date.now();
  const summary = protocols.reduce((acc, protocol) => {
    acc.totalProtocols += 1;
    if (protocol.status === "open") acc.openProtocols += 1;
    if (protocol.status === "in_progress") acc.inProgressProtocols += 1;
    if (protocol.status === "waiting") acc.waitingProtocols += 1;
    if (protocol.status === "resolved") acc.resolvedProtocols += 1;
    if (protocol.status === "closed") acc.closedProtocols += 1;
    if (protocol.priority === "urgent") acc.urgentProtocols += 1;
    if (protocol.dueDate && !CLOSED_STATUSES.has(protocol.status) && new Date(protocol.dueDate).getTime() < now) acc.overdueProtocols += 1;
    return acc;
  }, {
    totalProtocols: 0,
    openProtocols: 0,
    inProgressProtocols: 0,
    waitingProtocols: 0,
    resolvedProtocols: 0,
    closedProtocols: 0,
    urgentProtocols: 0,
    overdueProtocols: 0
  });

  return res.json({ ok: true, ...summary });
});

router.get("/", protocolAccess, async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, 1, 9999);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 300);
  const query = buildListQuery(req);
  const protocols = await Protocol.find(query)
    .populate("relatedProjectId", "name")
    .populate("relatedAssetId", "name assetCode")
    .populate("relatedAssociateId", "name")
    .lean();

  const ordered = sortProtocols(protocols);
  const total = ordered.length;
  const start = (page - 1) * limit;
  const items = ordered.slice(start, start + limit);

  return res.json({
    ok: true,
    protocols: items.map(serializeProtocol),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
  });
});

router.get("/:id", protocolAccess, async (req, res) => {
  const protocol = await findProtocolOr404(req, res);
  if (!protocol) return;
  const history = await ProtocolHistory.find({ tenantId: req.user.tenantId, protocolId: protocol._id }).sort({ createdAt: -1 }).lean();
  return res.json({ ok: true, protocol: serializeProtocol(protocol), history: history.map(serializeHistory) });
});

router.get("/:id/history", protocolAccess, async (req, res) => {
  const protocol = await findProtocolOr404(req, res);
  if (!protocol) return;
  const history = await ProtocolHistory.find({ tenantId: req.user.tenantId, protocolId: protocol._id }).sort({ createdAt: -1 }).lean();
  return res.json({ ok: true, protocol: serializeProtocol(protocol), history: history.map(serializeHistory) });
});

router.post("/", protocolAccess, async (req, res) => {
  try {
    const payload = buildProtocolPayload(req.body || {});
    const [project, asset, associate] = await Promise.all([
      validateLinkedRecord(Project, req.user.tenantId, payload.relatedProjectId, "Projeto", "name status"),
      validateLinkedRecord(Asset, req.user.tenantId, payload.relatedAssetId, "Patrimônio", "name assetCode status"),
      validateLinkedRecord(Associate, req.user.tenantId, payload.relatedAssociateId, "Associado", "name status")
    ]);
    const protocolNumber = await generateNextProtocolNumber(req.user.tenantId);
    const protocol = await Protocol.create({
      tenantId: req.user.tenantId,
      protocolNumber,
      ...payload,
      createdBy: req.user?.id || undefined,
      resolvedAt: payload.status === "resolved" ? new Date() : undefined,
      closedAt: payload.status === "closed" ? new Date() : undefined
    });
    await logHistory({
      protocolId: protocol._id,
      tenantId: req.user.tenantId,
      action: "criacao",
      oldStatus: "",
      newStatus: protocol.status,
      message: req.body?.historyMessage || payload.notes,
      req
    });
    const populated = await Protocol.findById(protocol._id)
      .populate("relatedProjectId", "name")
      .populate("relatedAssetId", "name assetCode")
      .populate("relatedAssociateId", "name");
    const responseProtocol = applyResponseLinks(populated, { project, asset, associate });
    return res.status(201).json({ ok: true, protocol: serializeProtocol(responseProtocol) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Número de protocolo já existe para este tenant." });
    }
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar protocolo." });
  }
});

router.put("/:id", protocolAccess, async (req, res) => {
  try {
    const protocol = await findProtocolOr404(req, res);
    if (!protocol) return;
    const payload = buildProtocolPayload(req.body || {}, protocol);
    const [project, asset, associate] = await Promise.all([
      validateLinkedRecord(Project, req.user.tenantId, payload.relatedProjectId, "Projeto", "name status"),
      validateLinkedRecord(Asset, req.user.tenantId, payload.relatedAssetId, "Patrimônio", "name assetCode status"),
      validateLinkedRecord(Associate, req.user.tenantId, payload.relatedAssociateId, "Associado", "name status")
    ]);
    const previousStatus = protocol.status;
    Object.assign(protocol, payload);
    if (payload.status === "resolved" && !protocol.resolvedAt) protocol.resolvedAt = new Date();
    if (payload.status === "closed" && !protocol.closedAt) protocol.closedAt = new Date();
    if (!["resolved", "closed"].includes(payload.status)) {
      protocol.resolvedAt = payload.status === "cancelled" ? protocol.resolvedAt : undefined;
      protocol.closedAt = undefined;
    }
    applyResponseLinks(protocol, { project, asset, associate });
    await protocol.save();
    await logHistory({
      protocolId: protocol._id,
      tenantId: req.user.tenantId,
      action: previousStatus !== protocol.status ? "mudanca_status" : "edicao",
      oldStatus: previousStatus,
      newStatus: protocol.status,
      message: req.body?.historyMessage || req.body?.notes || payload.notes,
      req
    });
    return res.json({ ok: true, protocol: serializeProtocol(protocol) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar protocolo." });
  }
});

router.post("/:id/status", protocolAccess, async (req, res) => {
  try {
    const protocol = await findProtocolOr404(req, res);
    if (!protocol) return;
    const newStatus = String(req.body?.status || "").trim();
    if (!STATUS_SET.has(newStatus)) {
      return res.status(400).json({ ok: false, message: "Status inválido." });
    }
    const oldStatus = protocol.status;
    protocol.status = newStatus;
    if (newStatus === "resolved") protocol.resolvedAt = new Date();
    if (newStatus === "closed") protocol.closedAt = new Date();
    if (!["resolved", "closed"].includes(newStatus)) {
      if (newStatus !== "cancelled") protocol.resolvedAt = undefined;
      protocol.closedAt = undefined;
    }
    await protocol.save();
    await logHistory({ protocolId: protocol._id, tenantId: req.user.tenantId, action: "mudanca_status", oldStatus, newStatus, message: req.body?.message || req.body?.notes, req });
    return res.json({ ok: true, protocol: serializeProtocol(protocol) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao mudar status do protocolo." });
  }
});

router.post("/:id/resolve", protocolAccess, async (req, res) => {
  try {
    const protocol = await findProtocolOr404(req, res);
    if (!protocol) return;
    const oldStatus = protocol.status;
    protocol.status = "resolved";
    protocol.resolvedAt = new Date();
    await protocol.save();
    await logHistory({ protocolId: protocol._id, tenantId: req.user.tenantId, action: "resolucao", oldStatus, newStatus: "resolved", message: req.body?.message || req.body?.notes, req });
    return res.json({ ok: true, protocol: serializeProtocol(protocol) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao resolver protocolo." });
  }
});

router.post("/:id/close", protocolAccess, async (req, res) => {
  try {
    const protocol = await findProtocolOr404(req, res);
    if (!protocol) return;
    const oldStatus = protocol.status;
    protocol.status = "closed";
    if (!protocol.resolvedAt) protocol.resolvedAt = new Date();
    protocol.closedAt = new Date();
    await protocol.save();
    await logHistory({ protocolId: protocol._id, tenantId: req.user.tenantId, action: "fechamento", oldStatus, newStatus: "closed", message: req.body?.message || req.body?.notes, req });
    return res.json({ ok: true, protocol: serializeProtocol(protocol) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao fechar protocolo." });
  }
});

router.post("/:id/cancel", protocolAccess, async (req, res) => {
  try {
    const protocol = await findProtocolOr404(req, res);
    if (!protocol) return;
    const oldStatus = protocol.status;
    protocol.status = "cancelled";
    protocol.closedAt = new Date();
    await protocol.save();
    await logHistory({ protocolId: protocol._id, tenantId: req.user.tenantId, action: "cancelamento", oldStatus, newStatus: "cancelled", message: req.body?.message || req.body?.notes, req });
    return res.json({ ok: true, protocol: serializeProtocol(protocol) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao cancelar protocolo." });
  }
});

module.exports = router;